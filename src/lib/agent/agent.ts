import { type Message, MessageType } from '../types/messages';
import {
  type AgentSkill,
  SkillInclusion,
  type SkillName,
} from './skills/model';
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
import { emitPrimaryStepUsage } from '../events/token-usage';
import { Notifier } from '../events/notifier';
import { ContextStore } from './context-store';
import { DEFAULT_MODEL, type ModelDefinition } from './inference';
import { loadMcpConfig, type MCP } from './mcp/mcp';
import { FileCache } from '../file-cache';
import { TaskList } from '../tasks';
import { discoverSkillFiles } from './skills/discovery';
import { pushEntry, setMessages, store } from '../state';
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
  'status-change': [AgentStatus];
  'reasoning-effort-change': [ReasoningEffort];
  'model-change': [ModelDefinition];
  'auto-mode-change': [boolean];
  'queue-change': [number];
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
  // Per-turn abort signal: lets the UI interrupt the active request without
  // tearing down the process, which the app-lifetime signal does.
  private _requestController?: AbortController;
  private _status: AgentStatus = { loading: false, text: '' };
  private _reasoningEffort: ReasoningEffort = ReasoningEffort.MEDIUM;
  private _model: ModelDefinition = DEFAULT_MODEL;
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
    // A teardown of the whole app also interrupts the active request.
    this.signal.addEventListener(
      'abort',
      () => this._requestController?.abort(),
      {
        once: true,
      }
    );
  }

  public get status(): AgentStatus {
    return this._status;
  }

  public get queuedMessageCount(): number {
    return this._messageQueue.length;
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

  public get model(): ModelDefinition {
    return this._model;
  }

  public set model(model: ModelDefinition) {
    this._model = model;
    this.emit('model-change', model);
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

    if (skill.inclusion === SkillInclusion.ALWAYS) this.activateSkill(skill);
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
      .catch(() => {
        this.setStatus({
          loading: false,
          text: chalk.red('Failed loading skills'),
        });
        return false;
      });
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
    this.emit('queue-change', 0);
    this.setStatus({ loading: false, text: '' });
  }

  /**
   * Interrupts the in-flight turn, if any. The partial response is discarded
   * and the agent returns to idle, ready for the next message.
   */
  public cancel(): void {
    this._requestController?.abort();
  }

  public async submitMessage(message: string): Promise<void> {
    // A turn is already running: queue the message and let the active turn
    // drain it once it finishes, preserving submission order.
    if (this._status.loading) {
      this._messageQueue.push(message);
      this.emit('queue-change', this._messageQueue.length);
      return;
    }
    this.emit('message-delta', {
      id: uuid(),
      type: MessageType.USER,
      content: message,
    });
    this._context.pushUser(message);
    store.dispatch(pushEntry(message));
    await this.processRequest();

    const next = this._messageQueue.shift();
    this.emit('queue-change', this._messageQueue.length);
    if (isNonEmptyString(next)) {
      await this.submitMessage(next);
    }
  }

  private setStatus(status: AgentStatus): void {
    this._status = status;
    this.emit('status-change', status);
  }

  private async processRequest(): Promise<void> {
    // Created before the loading flag flips so a `cancel()` racing in right
    // after the status change still finds a controller to abort.
    const request = new AbortController();
    this._requestController = request;
    this.setStatus({ loading: true, text: '' });

    try {
      const systemPrompt = await this.buildSystemPrompt();

      const result = streamText({
        allowSystemInMessages: true,
        abortSignal: request.signal,
        model: this._model.id,
        messages: [
          { content: systemPrompt, role: 'system' },
          ...this._context.messages,
        ],
        prepareStep: ({ messages }) => ({
          messages: this._context.materialize(messages),
        }),
        reasoning: this._reasoningEffort,
        tools: this._toolset,
        onStepEnd: step => emitPrimaryStepUsage(step.usage),
        onStepStart: () => {},
        stopWhen: isLoopFinished(),
        onError: ({ error }) => {
          if (request.signal.aborted) return;
          this.emit('message-delta', {
            id: uuid(),
            type: MessageType.ASSISTANT,
            content: String(error),
          });
        },
      });

      await this.handleResponseStream(result.stream);

      // Interrupted: the partial turn is discarded rather than committed to
      // the context, so the next message starts from the last full response.
      if (request.signal.aborted) {
        this.finishInterruptedTurn();
        return;
      }

      const steps = await result.steps;
      this._context.pushResponse(steps.flatMap(step => step.response.messages));

      // The final step's occupancy snapshot was already emitted by
      // `onStepEnd`, which fires for every step including the last one.
    } catch (err: unknown) {
      this.setStatus({ loading: false, text: chalk.red('Fatal error') });
      if (request.signal.aborted) {
        this.finishInterruptedTurn();
        return;
      }

      this.emit('message-delta', {
        type: MessageType.GENERIC,
        id: uuid(),
        failure: true,
        content: `Something went wrong whilst responding: ${String(err)}`,
      });
      return;
    } finally {
      this._requestController = undefined;
    }

    this.setStatus({ loading: false, text: '' });
  }

  private abortMessageLoadingStates(): void {
    const messages: Message[] = store
      .getState()
      .agent.messages.map(m =>
        m.type === MessageType.GENERIC ? { ...m, loading: false } : m
      );
    store.dispatch(setMessages(messages));
  }

  private finishInterruptedTurn(): void {
    this.emit('message-delta', {
      type: MessageType.GENERIC,
      id: uuid(),
      content: chalk.dim('Interrupted'),
    });
    this.setStatus({ loading: false, text: '' });
    this.abortMessageLoadingStates();
  }

  private async handleResponseStream(
    stream: AsyncIterableStream<TextStreamPart<ToolSet>>
  ): Promise<void> {
    type PartId = string;

    const messages = new Map<PartId, { content: string; messageId: string }>();

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
        type: MessageType.GENERIC,
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
            messages.set(part.id, { content: '', messageId: uuid() });
            break;
          case 'text-delta': {
            const prev = messages.get(part.id);
            const updated = (prev?.content ?? '') + part.text;
            const messageId = prev?.messageId ?? uuid();

            messages.set(part.id, { content: updated, messageId });

            if (isNonEmptyString(updated)) {
              this.emit('message-delta', {
                type: MessageType.ASSISTANT,
                id: messageId,
                content: updated,
              });
            }
            break;
          }
          case 'text-end': {
            messages.delete(part.id);
            break;
          }
          case 'reasoning-start': {
            const id = uuid();
            reasoning = { id, startedAt: Date.now() };
            this.emit('message-delta', {
              type: MessageType.GENERIC,
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
      // An interrupted turn is not an error; `processRequest` reports it.
      if (this._requestController?.signal.aborted) return;
      this.emit('message-delta', {
        type: MessageType.GENERIC,
        id: uuid(),
        failure: true,
        content: `Something went wrong whilst responding: ${String(err)}`,
      });
    }
  }
}
