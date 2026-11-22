import type { Message } from '../types/messages';
import type { AgentSkill, SkillName } from './skills/common';
import { isNonEmptyString } from '@vxti/typed';
import {
  type AsyncIterableStream,
  isLoopFinished,
  streamText,
  type TextStreamPart,
  type ToolSet,
} from 'ai';
import chalk from 'chalk';
import { EventEmitter } from 'node:events';
import { v7 as uuid } from 'uuid';
import { type TokenConsumeProps, TokenSource } from '../events/events';
import { emitContextUsageEvent } from '../events/token-usage';
import { Notifier } from '../events/notifier';
import { ContextStore } from './context-store';
import { getAppropriateModel, TaskComplexity } from './inference';
import { loadMcpConfig, type MCP } from './mcp/mcp';
import { FileCache } from '../file-cache';
import { TaskList } from '../tasks';
import { discoverSkillFiles } from './skills/discovery';
import { pushEntry, store } from '../state';
import { constructSystemPrompt } from './system-prompt';
import {
  isAutoApproveEnabled,
  makeToolSet,
  setAutoApproveEnabled,
  toolRegistry,
} from './tools';

export interface AgentStatus {
  loading: boolean;
  text?: string;
}

export enum ReasoningEffort {
  NONE = 'none',
  MINIMAL = 'minimal',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  EXTRA_HIGH = 'xhigh',
  MAX = 'max',
}

interface EventMap {
  'message-delta': [Message];
  'tokens-consumed': [TokenConsumeProps];
  'status-change': [AgentStatus];
  'reasoning-effort-change': [ReasoningEffort];
  'auto-mode-change': [boolean];
}

export class Agent extends EventEmitter<EventMap> {
  private readonly _taskList: TaskList;
  private readonly _fileCache: FileCache;
  private readonly _context: ContextStore;
  private readonly _mcpServers: Set<MCP>;
  private readonly _notifier: Notifier;
  private readonly _toolset: ToolSet;
  private readonly _skills: Map<SkillName, AgentSkill>;
  private readonly _activeSkills: Map<SkillName, AgentSkill>;
  private readonly _messageQueue: string[] = [];
  private _status: AgentStatus = { loading: false, text: '' };
  private _reasoningEffort: ReasoningEffort = ReasoningEffort.MEDIUM;
  private _gitIgnore: Set<string>;

  public constructor(
    private readonly signal: AbortSignal,
    private readonly _cwd: string,
    gitIgnore: Set<string> = new Set()
  ) {
    super();
    this._taskList = new TaskList();
    this._fileCache = new FileCache();
    this._context = new ContextStore(this._cwd);
    this._activeSkills = new Map();
    this._skills = new Map();
    this._notifier = new Notifier();
    this._mcpServers = new Set<MCP>();
    this._gitIgnore = gitIgnore;
    this._toolset = makeToolSet(toolRegistry, this._notifier, this.signal);
  }

  public get status(): AgentStatus {
    return this._status;
  }

  public get taskList(): TaskList {
    return this._taskList;
  }

  public get reasoningEffort(): ReasoningEffort {
    return this._reasoningEffort;
  }

  public set reasoningEffort(effort: ReasoningEffort) {
    this._reasoningEffort = effort;
    this.emit('reasoning-effort-change', effort);
  }

  /**
   * Auto mode: unlisted shell commands are vetted by a decision model and run
   * without prompting when it clears them. The enforcement flag lives with the
   * shell tool; this is the user-facing toggle that keeps it in sync.
   */
  public get autoApprove(): boolean {
    return isAutoApproveEnabled();
  }

  public set autoApprove(enabled: boolean) {
    setAutoApproveEnabled(enabled);
    this.emit('auto-mode-change', enabled);
  }

  public toggleAutoApprove(): boolean {
    this.autoApprove = !this.autoApprove;
    return this.autoApprove;
  }

  public get fileCache(): FileCache {
    return this._fileCache;
  }

  public get mcpServers(): MCP[] {
    return Array.from(this._mcpServers);
  }

  public findSkill(name: string): AgentSkill | undefined {
    return this._skills.get(name);
  }

  public get skills(): AgentSkill[] {
    return Array.from(this._skills.values());
  }

  public setGitIgnore(gitIgnore: Set<string>): void {
    this._gitIgnore = gitIgnore;
  }

  public loadSkill(skill: AgentSkill): void {
    this._skills.set(skill.name, skill);
  }

  public activateSkill(skill: AgentSkill): void {
    this._activeSkills.set(skill.name, skill);
  }

  public async loadSkills(): Promise<boolean> {
    return await discoverSkillFiles()
      .then(skills => {
        skills.forEach(skill => this.loadSkill(skill));
        return true;
      })
      .catch(() => false);
  }

  public async loadMcpServers(): Promise<boolean> {
    return await loadMcpConfig(this.signal)
      .then(servers => {
        servers.forEach(server => this.registerMcpServer(server));
        return true;
      })
      .catch(() => false);
  }

  private registerMcpServer(mcpServer: MCP): void {
    this._mcpServers.add(mcpServer);
  }

  /**
   * Builds the system prompt from the agent's current state (skills, tasks,
   * MCP servers, working directory). Exposed so the UI can render the prompt
   * on demand; `processRequest` uses it for every turn.
   */
  public async buildSystemPrompt(): Promise<string> {
    return constructSystemPrompt({
      activeSkills: this._activeSkills,
      fileCache: this._fileCache,
      mcpServers: this._mcpServers,
      taskList: this._taskList,
      cwd: this._cwd,
      skills: this._skills,
      gitIgnore: this._gitIgnore,
    });
  }

  /**
   * Discards the current conversation. The user-facing message list is owned by
   * the UI layer and cleared separately.
   */
  public clear(): void {
    this._context.clear();
    this._messageQueue.length = 0;
    this.setStatus({ loading: false, text: '' });
  }

  public async submitMessage(message: string): Promise<void> {
    // A turn is already running: queue the message and let the active turn
    // drain it once it finishes, preserving submission order.
    if (this._status.loading) {
      this._messageQueue.push(message);
      return;
    }
    this.emit('message-delta', { id: uuid(), type: 'user', content: message });
    this._context.pushUser(message);
    store.dispatch(pushEntry(message));
    await this.processRequest();

    const next = this._messageQueue.shift();
    if (isNonEmptyString(next)) {
      await this.submitMessage(next);
    }
  }

  private setStatus(status: AgentStatus): void {
    this._status = status;
    this.emit('status-change', status);
  }

  private async processRequest(): Promise<void> {
    this.setStatus({ loading: true, text: '' });

    const systemPrompt = await this.buildSystemPrompt();

    const result = streamText({
      allowSystemInMessages: true,
      abortSignal: this.signal,
      model: getAppropriateModel(TaskComplexity.MEDIUM),
      messages: [
        { content: systemPrompt, role: 'system' },
        ...this._context.materialize(),
      ],
      reasoning: this._reasoningEffort,
      tools: this._toolset,
      onStepEnd: step => {
        this.emit('tokens-consumed', {
          input: step.usage.inputTokens ?? 0,
          output: step.usage.outputTokens ?? 0,
          source: TokenSource.PRIMARY,
        });
      },
      onStepStart: () => {},
      stopWhen: isLoopFinished(),
      onError: ({ error }) => {
        this.emit('message-delta', {
          id: uuid(),
          type: 'assistant',
          content: String(error),
        });
      },
    });

    try {
      await this.handleResponseStream(result.stream);

      const finalStep = await result.finalStep;
      this._context.pushResponse(finalStep.response.messages);

      // Occupancy of the window going into the next turn: the full prompt the
      // model just received plus the reply now appended to it. This is an
      // absolute snapshot, not a per-step delta, so it is reported separately
      // from billed usage and reflects any compaction already applied.
      emitContextUsageEvent({
        input: finalStep.usage.inputTokens ?? 0,
        output: finalStep.usage.outputTokens ?? 0,
      });
    } catch (err: unknown) {
      this.emit('message-delta', {
        type: 'generic',
        id: uuid(),
        failure: true,
        content: `Something went wrong whilst responding: ${String(err)}`,
      });
      this.setStatus({ loading: false, text: chalk.red('Fatal error') });
      return;
    }

    this.setStatus({ loading: false, text: '' });
  }

  private async handleResponseStream(
    stream: AsyncIterableStream<TextStreamPart<ToolSet>>
  ): Promise<void> {
    const messages = new Map<string, string>();
    let reasoning: { id: string; startedAt: number } | undefined;

    // Reasoning is surfaced in the message list: a spinner row while the model
    // thinks, collapsed to the elapsed time once the block ends.
    const finishReasoning = (): void => {
      if (reasoning === undefined) return;
      const seconds = Math.max(
        1,
        Math.round((Date.now() - reasoning.startedAt) / 1000)
      );
      this.emit('message-delta', {
        type: 'generic',
        id: reasoning.id,
        loading: false,
        content: chalk.dim(`Thought for ${seconds}s`),
      });
      reasoning = undefined;
    };
    try {
      for await (const part of stream) {
        switch (part.type) {
          case 'text-start':
            messages.set(part.id, '');
            break;
          case 'text-delta': {
            const updated = (messages.get(part.id) ?? '') + part.text;
            messages.set(part.id, updated);

            if (isNonEmptyString(updated)) {
              this.emit('message-delta', {
                type: 'assistant',
                id: part.id,
                content: updated,
              });
            }
            break;
          }
          case 'reasoning-start': {
            const id = uuid();
            reasoning = { id, startedAt: Date.now() };
            this.emit('message-delta', {
              type: 'generic',
              id,
              loading: true,
              content: 'Thinking...',
            });
            break;
          }
          case 'reasoning-end':
            finishReasoning();
            break;
        }
      }
    } catch (err) {
      finishReasoning();
      this.emit('message-delta', {
        type: 'generic',
        id: uuid(),
        failure: true,
        content: `Something went wrong whilst responding: ${String(err)}`,
      });
    }
  }
}
