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
import { glob } from 'node:fs/promises';

import { createFileSelector, type FileSelector } from '../file-selector';
import { InputHandler } from '../input/input';
import { textBlock } from '../rendering/fragments';
import { ShellBuffer } from '../rendering/shell-buffer';
import { previewArgs, formatMarkdown } from '../rendering/formatting';
import { TaskList } from './task-list';
import { type ToolBase, ToolSelectionOption } from './tools';
import { allTools } from './tools/registry';
import { type IO, type UserInputQueue, type UserInputRequest } from './types';
import compact from 'lodash/compact';
import first from 'lodash/first';

export class AgentContext {
  private readonly tools: ToolSet;
  private readonly model: LanguageModel;
  private readonly messages: ModelMessage[];
  private _systemPrompt: string | undefined;
  private messageQueue: string[];
  private isStreaming: boolean;

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
    this.abortController = abortController;
    this.cwd = process.cwd();

    this.model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
    this.isStreaming = false;
    this.messageQueue = [];
    this.messages = [];
    this.taskList = new TaskList();

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

    this.tools = this.constructToolset();
  }

  // eslint-disable-next-line
  public async start(): Promise<void> {
    void this.inputHandler.consumeUserInputQueue();

    this.inputHandler.syncInputField();
  }

  public async queueUserMessage(message: string): Promise<AgentContext> {
    this.messageQueue.push(message);

    if (this.isStreaming) return this;

    while (this.messageQueue.length > 0) {
      const next = this.messageQueue.shift()!;
      this.messages.push({ content: next, role: 'user' });

      const systemPrompt = await this.composeSystemPrompt();

      await this.makeRequest([
        {
          content: systemPrompt,
          role: 'system',
        },
        ...this.messages,
      ]);

      await this.pollTaskCompletion();
    }
    return this;
  }

  private async pollTaskCompletion() {
    let continuations = 0;
    while (
      this.messageQueue.length === 0 &&
      this.taskList.hasIncompleteTasks() &&
      continuations < MAX_TASK_CONTINUATION_TURNS
    ) {
      continuations += 1;
      this.messages.push({
        content:
          'The task list still has incomplete tasks. Continue working on the' +
          ' next pending or in-progress task and update the task list as you' +
          ' make progress. Do not wait for further user input.',
        role: 'user',
      });

      const systemPrompt = await this.composeSystemPrompt();

      await this.makeRequest([
        {
          content: systemPrompt,
          role: 'system',
        },
        ...this.messages,
      ]);
    }
  }

  private async composeSystemPrompt(): Promise<string> {
    if (!this._systemPrompt) {
      this._systemPrompt = await this.constructSystemPrompt();
    }
    const taskFragment = this.renderTaskListFragment();

    return compact([this._systemPrompt, taskFragment]).join('\n');
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
    this.shellBuffer.setStatus('thinking…');
    this.isStreaming = true;

    const result = streamText({
      allowSystemInMessages: true,
      abortSignal: this.abortController.signal,
      model: this.model,
      messages,
      tools: this.tools,
      stopWhen: stepCountIs(20),
    });

    try {
      for await (const chunk of result.textStream) {
        buffer += chunk;
      }
    } catch (err) {
      this.shellBuffer.pushText(chalk.red(`Stream error: ${String(err)}\n`));
    } finally {
      this.isStreaming = false;
      this.shellBuffer.setStatus(null);
    }

    if (buffer.length > 0) {
      this.shellBuffer.pushText(
        `${chalk.blue('◆ ') + formatMarkdown(buffer)}\n`
      );
    }

    try {
      const finalMessages = (await result.response).messages;
      this.messages.push(...finalMessages);
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

  private async constructSystemPrompt(): Promise<string> {
    const supportedFileNames: string[] = [
      'AGENTS',
      'AGENT',
      'SKILL',
      'CLAUDE',
      'claude',
      'copilot-instructions',
    ];
    const agentFile = await Array.fromAsync(
      glob(`**/{${supportedFileNames.join(',')}}.md`, {
        cwd: this.cwd,
      })
    );

    return first(agentFile) ?? DEFAULT_SYSTEM_PROMPT;
  }
}

const DEFAULT_SYSTEM_PROMPT = `You are an expert at writing, navigating and refactoring codebases.
You've been in the industry for more than 15 years, and have experienced all frameworks of all kinds.
You have a ton of experience with languages such as TypeScript, JavaScript, Java, Kotlin, C++, C and Go.

Whenever the task is unable to be executed due to ambiguity, don't be afraid to prompt the user with questions.
If the task is deemed too complex to execute in one go, make a task list for it and execute it in steps.

A few things to absolutely NEVER do:

- Do not ever delete files without explicit user permissions.
- Whenever simpler tools exist to perform certain actions with, use those. 
  If you can read a file without commands, then do so.
- Don't write redundant comments for things that don't demand so. You should
  make your output speak for itself. Whenever the user requests code to be generated,
  the code should be understandable enough so that a comment is not necessary.
`;

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
