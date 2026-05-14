import { openai } from '@ai-sdk/openai';
import {
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
  type Tool,
  tool as createTool,
  type ToolSet,
} from 'ai';
import chalk from 'chalk';
import { EventEmitter } from 'node:events';
import ora from 'ora';
import { createFileSelector, type FileSelector } from '../file-selector';
import { InputHandler } from '../input/input';
import { ShellBuffer, textBlock } from '../rendering/shell-buffer';
import { previewArgs, formatMarkdown } from '../rendering/formatting';
import { TaskList } from './task-list';
import { type ToolBase, ToolSelectionOption } from './tools';
import { allTools } from './tools/registry';
import { type IO, type UserInputQueue, type UserInputRequest } from './types';

export class AgentContext extends EventEmitter {
  private readonly _tools: ToolSet;
  private readonly _model: LanguageModel;
  private readonly _messages: ModelMessage[];
  private _systemMessageFragments: string[];
  private _messageQueue: string[];
  private _isStreaming: boolean;

  public taskList: TaskList;
  public abortController: AbortController;

  public readonly cwd: string;
  public readonly shellBuffer: ShellBuffer;
  public readonly fileSelector: FileSelector;
  public readonly inputHandler: InputHandler;

  /**
   * Tracks the last-known modification time (mtimeMs) for files that have been
   * read by the agent. `insert_in_file` consults this map to detect external
   * modifications between read and write — if the on-disk mtime no longer
   * matches the cached value (or is missing entirely), the edit is rejected
   * so the agent must re-read the file with fresh line numbers.
   */
  public readonly fileModificationCache: Map<string, number> = new Map();

  constructor(io: IO, abortController: AbortController) {
    super();
    this.abortController = abortController;
    const MODEL_ID = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    this._model = openai(MODEL_ID);
    this.cwd = process.cwd();
    this._isStreaming = false;
    this._messageQueue = [];
    this._messages = [];
    this.taskList = new TaskList();
    this._systemMessageFragments = this.constructInitialSystemPromptFragments();

    this.shellBuffer = new ShellBuffer(io.outputStream);
    this.shellBuffer.push(
      textBlock({
        content: `${chalk.blue('◆')} ${chalk.bold('Eccentric Agent')}${chalk.dim(
          ' — type @ for files, Ctrl+C to' + ' exit\n\n'
        )}`,
        align: 'center',
      })
    );

    this.inputHandler = new InputHandler(this, io.inputStream);
    this.fileSelector = createFileSelector(this);

    this._tools = this.constructToolset();
  }

  // eslint-disable-next-line
  public async start(): Promise<void> {
    void this.inputHandler.consumeUserInputQueue();

    this.inputHandler.syncInputField();
  }

  public async queueUserMessage(message: string): Promise<AgentContext> {
    this._messageQueue.push(message);

    if (this._isStreaming) return this;

    while (this._messageQueue.length > 0) {
      const next = this._messageQueue.shift()!;
      this._messages.push({ content: next, role: 'user' });

      await this.makeRequest([
        {
          content: this.composeSystemPrompt(),
          role: 'system',
        },
        ...this._messages,
      ]);

      await this.pollTaskCompletion();
    }
    return this;
  }

  private async pollTaskCompletion() {
    let continuations = 0;
    while (
      this._messageQueue.length === 0 &&
      this.taskList.hasIncompleteTasks() &&
      continuations < MAX_TASK_CONTINUATION_TURNS
    ) {
      continuations += 1;
      this._messages.push({
        content:
          'The task list still has incomplete tasks. Continue working on the' +
          ' next pending or in-progress task and update the task list as you' +
          ' make progress. Do not wait for further user input.',
        role: 'user',
      });

      await this.makeRequest([
        {
          content: this.composeSystemPrompt(),
          role: 'system',
        },
        ...this._messages,
      ]);
    }
  }

  private composeSystemPrompt(): string {
    const fragments = [...this._systemMessageFragments];
    const taskFragment = this.renderTaskListFragment();
    if (taskFragment) fragments.push(taskFragment);
    return fragments.join('\n');
  }

  private renderTaskListFragment(): string | null {
    if (!this.taskList.hasTasks) return null;

    const lines = this.taskList.tasks.map(task => {
      const marker =
        task.status === 'completed'
          ? '[x]'
          : task.status === 'in_progress'
            ? '[~]'
            : '[ ]';
      return `  ${marker} (${task.id}) ${task.description}`;
    });

    return [
      'Current task list (markers: [ ] pending, [~] in_progress, [x] completed):',
      ...lines,
      'While any task is not completed you MUST keep working autonomously.' +
        ' Use `update_task_list` to mark tasks "in_progress" before starting' +
        ' and "completed" when done. Only stop once every task is completed.',
    ].join('\n');
  }

  private async makeRequest(messages: ModelMessage[]) {
    if (!process.env.OPENAI_API_KEY) {
      this.shellBuffer.pushText(
        chalk.red('OPENAI_API_KEY not set. Export key then retry.\n')
      );
      return;
    }

    let buffer = '';
    const spinner = ora({
      text: 'thinking…\n\n',
      spinner: 'dots',
      stream: this.shellBuffer.outputStream,
    }).start();
    this._isStreaming = true;

    const result = streamText({
      allowSystemInMessages: true,
      abortSignal: this.abortController.signal,
      model: this._model,
      messages,
      tools: this._tools,
      stopWhen: stepCountIs(20),
    });

    try {
      for await (const chunk of result.textStream) {
        buffer += chunk;
      }
    } catch (err) {
      this.shellBuffer.pushText(chalk.red(`Stream error: ${String(err)}\n`));
    } finally {
      this._isStreaming = false;
      spinner.stop();
    }

    if (buffer.length > 0) {
      this.shellBuffer.pushText(
        `${chalk.blue('◆ ') + formatMarkdown(buffer)}\n`
      );
    }

    try {
      const finalMessages = (await result.response).messages;
      this._messages.push(...finalMessages);
    } catch (err) {
      this.shellBuffer.pushText(
        chalk.red(`Failed to record assistant turn: ${String(err)}\n`)
      );
    }

    this.inputHandler.syncInputField();
  }

  public createUserInputQueue(): ManagedUserInputQueue {
    const pending: PendingRequest[] = [];
    let notify: (() => void) | null = null;

    function signal(): void {
      const n = notify;
      notify = null;
      n?.();
    }

    return {
      request(req) {
        return new Promise<string>(resolve => {
          pending.push({ request: req, resolve });
          signal();
        });
      },
      async next() {
        while (pending.length === 0) {
          await new Promise<void>(resolve => {
            notify = resolve;
          });
        }
        const item = pending.shift();
        if (!item) {
          throw new Error('user input queue invariant violated');
        }
        return {
          toolName: item.request.toolName,
          prompt: item.request.prompt,
          options: item.request.options,
          resolve: item.resolve,
        };
      },
      size() {
        return pending.length;
      },
    };
  }

  private constructToolset(): ToolSet {
    return Object.fromEntries(
      allTools.map(tool => [tool.internalName, this.constructTool(tool)])
    );
  }

  private constructTool(tool: ToolBase): Tool {
    return createTool({
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (input: unknown) => {
        const processed: unknown = await tool.inputSchema.parse(input);
        const needsApproval = await tool.requiresApproval(processed, this);

        if (needsApproval) {
          const options = await tool.approvalOptions(processed, this);
          const prompt = `tool "${tool.internalName}" requires approval — args: ${previewArgs(input)}`;

          const chosen = await this.inputHandler.inputQueue.request({
            toolName: tool.internalName,
            prompt,
            options,
          });
          const selectionOption = await tool.onOptionSelect(
            processed,
            chosen,
            this
          );

          if (selectionOption !== ToolSelectionOption.ALLOW) {
            return {
              error: `User denied permission to run tool "${tool.internalName}".`,
            };
          }
        }

        this.shellBuffer.pushText(
          `${formatMarkdown(tool.inputToString(processed))}\n`
        );

        let output: unknown;
        try {
          output = await tool.handle(processed, this);
        } catch (err) {
          const message = `Tool "${tool.internalName}" failed: ${String(err)}`;
          this.shellBuffer.pushText(chalk.red(`${message}\n`));
          return { error: message, ok: false };
        }

        const parsed = await tool.outputSchema.safeParseAsync(output);

        if (!parsed.success) {
          const message = `Tool "${tool.internalName}" returned an unexpected shape: ${String(parsed.error)}`;
          this.shellBuffer.pushText(chalk.red(`${message}\n`));
          return { error: message, ok: false, raw: output };
        }

        this.shellBuffer.pushText(
          `${formatMarkdown(tool.outputToString(parsed.data))}\n`
        );

        return parsed.data;
      },
    });
  }

  private constructInitialSystemPromptFragments(): string[] {
    return [
      'You are a professional coding assistant with a variety of skills.',
      `Your current working directory is '${this.cwd}'`,
    ];
  }
}

interface PendingRequest {
  request: UserInputRequest;
  resolve: (option: string) => void;
}

export interface DequeuedRequest extends UserInputRequest {
  resolve: (option: string) => void;
}

export interface ManagedUserInputQueue extends UserInputQueue {
  /**
   * Pops the next pending request, awaiting until one is enqueued.
   */
  next(): Promise<DequeuedRequest>;
  size(): number;
}

const MAX_TASK_CONTINUATION_TURNS = 10;
