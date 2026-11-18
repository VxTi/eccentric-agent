import type { Message } from '../types/messages';
import type { AgentSkill, SkillName } from './skills/common';
import { isNonEmptyString } from '@vxti/typed';
import {
  type AsyncIterableStream,
  isLoopFinished,
  type ModelMessage,
  streamText,
  type TextStreamPart,
  type ToolSet,
} from 'ai';
import { EventEmitter } from 'node:events';
import { v7 as uuid } from 'uuid';
import { type TokenConsumeProps, TokenSource } from '../events/events';
import { Notifier } from '../events/notifier';
import { getAppropriateModel, TaskComplexity } from './inference';
import { loadMcpConfig, type MCP } from './mcp/mcp';
import { FileCache } from '../file-cache';
import { TaskList } from '../tasks';
import { discoverSkillFiles } from './skills/discovery';
import { constructSystemPrompt } from './system-prompt';
import { makeToolSet, toolRegistry } from './tools';

interface EventMap {
  'message-delta': Message[];
  'reasoning-delta': Message[];
  'tokens-consumed': TokenConsumeProps[];
}

export class Agent extends EventEmitter<EventMap> {
  private readonly _taskList: TaskList;
  private readonly _fileCache: FileCache;
  private readonly _modelMessages: ModelMessage[] = [];
  private readonly _mcpServers: Set<MCP>;
  private readonly _notifier: Notifier;
  private readonly _toolset: ToolSet;
  private readonly _skills: Map<SkillName, AgentSkill>;
  private readonly _activeSkills: Map<SkillName, AgentSkill>;

  public constructor(
    private readonly signal: AbortSignal,
    private readonly _cwd: string,
    private readonly _gitIgnore: Set<string> = new Set()
  ) {
    super();
    this._taskList = new TaskList();
    this._fileCache = new FileCache();
    this._activeSkills = new Map();
    this._skills = new Map();
    this._notifier = new Notifier();
    this._mcpServers = new Set<MCP>();
    this._toolset = makeToolSet(toolRegistry, this._notifier, this.signal);
  }

  public loadSkill(skill: AgentSkill): void {
    this._skills.set(skill.name, skill);
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

  public async submitMessage(message: string) {
    this._modelMessages.push({ role: 'user', content: message });
    await this.processRequest();
  }

  private async processRequest(): Promise<void> {
    const systemPrompt = await constructSystemPrompt({
      activeSkills: this._activeSkills,
      fileCache: this._fileCache,
      mcpServers: this._mcpServers,
      taskList: this._taskList,
      cwd: this._cwd,
      skills: this._skills,
      gitIgnore: this._gitIgnore,
    });

    const result = streamText({
      allowSystemInMessages: true,
      abortSignal: this.signal,
      model: getAppropriateModel(TaskComplexity.MEDIUM),
      messages: [
        { content: systemPrompt, role: 'system' },
        ...this._modelMessages,
      ],
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
      const response = finalStep.response;
      this._modelMessages.push(...response.messages);
    } catch (err: unknown) {
      this.emit('message-delta', {
        type: 'generic',
        id: uuid(),
        failure: true,
        content: `Something went wrong whilst responding: ${String(err)}`,
      });
    }
    return;
  }

  private async handleResponseStream(
    stream: AsyncIterableStream<TextStreamPart<ToolSet>>
  ) {
    const messages = new Map<string, string>();
    const reasoning = new Map<string, string>();

    try {
      for await (const part of stream) {
        switch (part.type) {
          case 'text-start':
            messages.set(part.id, '');
            break;
          case 'text-delta':
            const initialContent = messages.get(part.id) ?? '';
            const updated = initialContent + part.text;
            messages.set(part.id, updated);

            if (isNonEmptyString(updated)) {
              this.emit('message-delta', {
                type: 'assistant',
                id: part.id,
                content: updated,
              });
            }
            break;
          case 'reasoning-start':
            reasoning.set(part.id, '');
            break;
          case 'reasoning-delta':
            const reasoningContent = reasoning.get(part.id) ?? '';
            const rUpdated = reasoningContent + part.text;
            reasoning.set(part.id, rUpdated);

            if (!isNonEmptyString(rUpdated)) break;

            this.emit('message-delta', {
              type: 'generic',
              id: part.id,
              content: rUpdated,
            });
            break;
          case 'reasoning-end':
            reasoning.delete(part.id);
        }
      }
    } catch (err) {
      this.emit('message-delta', {
        type: 'generic',
        id: uuid(),
        failure: true,
        content: `Something went wrong whilst responding: ${String(err)}`,
      });

      return;
    }
  }

  private get activeSkills(): AgentSkill[] {
    return Array.from(this._activeSkills.values());
  }
}
