import { openai } from '@ai-sdk/openai';
import {
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
  tool as createTool,
  type ToolSet,
} from 'ai';
import chalk from 'chalk';
import { EventEmitter } from 'node:events';
import ora from 'ora';
import { createFileSelector, type FileSelector } from '../file-selector';
import { InputHandler } from '../input/input';
import { RendererInstance } from '../rendering/renderer';
import { previewArgs, formatMarkdown } from './formatting';
import { type ToolBase, ToolSelectionOption } from './tools';
import { allTools } from './tools/registry';
import { type UserInputQueue, type UserInputRequest } from './types';

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

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
}

export interface TaskUpdate {
  id: string;
  status: TaskStatus;
}

const MAX_TASK_CONTINUATION_TURNS = 10;

export class AgentContext extends EventEmitter {
  private readonly _tools: ToolSet;
  private readonly _model: LanguageModel;
  private readonly _messages: ModelMessage[];
  private _systemMessageFragments: string[];
  private _messageQueue: string[];
  private _isStreaming: boolean;
  private _taskList: Task[] | null;

  public readonly cwd: string;
  public readonly renderer: RendererInstance;
  public readonly fileSelector: FileSelector;
  public readonly inputHandler: InputHandler;

  constructor() {
    super();
    const MODEL_ID = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    this._model = openai(MODEL_ID);
    this.cwd = process.cwd();
    this._isStreaming = false;
    this._messageQueue = [];
    this._messages = [];
    this._taskList = null;
    this._systemMessageFragments = this.constructInitialSystemPromptFragments();

    this.renderer = new RendererInstance(this);
    this.inputHandler = new InputHandler(this);
    this.fileSelector = createFileSelector(this);

    this._tools = this.buildAiTools();
  }

  // eslint-disable-next-line
  public async start(): Promise<void> {
    void this.inputHandler.consumeUserInputQueue();

    this.renderer.render();
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

      let continuations = 0;
      while (
        this._messageQueue.length === 0 &&
        this.hasIncompleteTasks() &&
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
    return this;
  }

  private composeSystemPrompt(): string {
    const fragments = [...this._systemMessageFragments];
    const taskFragment = this.renderTaskListFragment();
    if (taskFragment) fragments.push(taskFragment);
    return fragments.join('\n');
  }

  private renderTaskListFragment(): string | null {
    if (!this._taskList || this._taskList.length === 0) return null;

    const lines = this._taskList.map(task => {
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

  public getTaskList(): Task[] | null {
    return this._taskList ? this._taskList.map(task => ({ ...task })) : null;
  }

  public setTaskList(tasks: Task[]): Task[] {
    this._taskList = tasks.map(task => ({ ...task }));
    return this.getTaskList()!;
  }

  public updateTasks(updates: TaskUpdate[]): Task[] {
    if (!this._taskList) {
      throw new Error('No task list exists.');
    }

    for (const update of updates) {
      const task = this._taskList.find(t => t.id === update.id);
      if (!task) {
        throw new Error(
          `No task with id "${update.id}" exists in the task list.`
        );
      }
      task.status = update.status;
    }

    return this.getTaskList()!;
  }

  public clearTaskList(): void {
    this._taskList = null;
  }

  public hasIncompleteTasks(): boolean {
    if (!this._taskList || this._taskList.length === 0) return false;
    return this._taskList.some(task => task.status !== 'completed');
  }

  private async makeRequest(messages: ModelMessage[]) {
    if (!process.env.OPENAI_API_KEY) {
      this.renderer.commitMessage(
        chalk.red('OPENAI_API_KEY not set. Export key then retry.\n')
      );
      return;
    }

    let buffer = '';
    const spinner = ora({
      text: 'thinking…',
      spinner: 'dots',
      stream: this.renderer.outputStream,
    }).start();
    this._isStreaming = true;

    const result = streamText({
      allowSystemInMessages: true,
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
      this.renderer.commitMessage(chalk.red(`Stream error: ${String(err)}\n`));
    } finally {
      this._isStreaming = false;
      spinner.stop();
    }

    if (buffer.length > 0) {
      this.renderer.commitMessage(
        `${chalk.green('◆ ') + formatMarkdown(buffer)}\n`
      );
    }

    try {
      const finalMessages = (await result.response).messages;
      this._messages.push(...finalMessages);
    } catch (err) {
      this.renderer.commitMessage(
        chalk.red(`Failed to record assistant turn: ${String(err)}\n`)
      );
    }

    this.renderer.render();
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

  private buildAiTools(): ToolSet {
    return Object.fromEntries(
      allTools.map((tool: ToolBase) => {
        const constructedTool = createTool({
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

            this.renderer.commitMessage(
              `${formatMarkdown(tool.inputToString(processed))}\n`
            );

            let output: unknown;
            try {
              output = await tool.handle(processed, this);
            } catch (err) {
              const message = `Tool "${tool.internalName}" failed: ${String(err)}`;
              this.renderer.commitMessage(chalk.red(`${message}\n`));
              return { error: message, ok: false };
            }

            const parsed = await tool.outputSchema.safeParseAsync(output);

            if (!parsed.success) {
              const message = `Tool "${tool.internalName}" returned an unexpected shape: ${String(parsed.error)}`;
              this.renderer.commitMessage(chalk.red(`${message}\n`));
              return { error: message, ok: false, raw: output };
            }

            this.renderer.commitMessage(
              `${formatMarkdown(tool.outputToString(parsed.data))}\n`
            );

            return parsed.data;
          },
        });

        return [tool.internalName, constructedTool];
      })
    );
  }

  private constructInitialSystemPromptFragments(): string[] {
    return [
      'You are a professional coding assistant with a variety of skills.',
      `Your current working directory is '${this.cwd}'`,
    ];
  }
}
