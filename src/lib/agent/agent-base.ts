import { type ModelMessage, type ToolSet } from 'ai';
import type { Message } from '../types/messages';
import { Notifier as NotifierImpl, type Notifier } from '../events/notifier';
import { FileCache as FileCacheImpl, type FileCache } from '../file-cache';
import { TaskList as TaskListImpl, type TaskList } from '../tasks';
import { EventEmitter } from 'node:events';
import { isNil, isNotNil, type Nullable } from '@vxti/typed';
import { BitSet } from '../utils/bitset';
import { ContextCompactor } from './context-compaction';
import { ContextStore } from './context-store';
import { DEFAULT_MODEL, type ModelDefinition } from './inference';
import { loadMcpConfig, type MCP } from './mcp/mcp';
import { constructSkillStateReminder } from './system-prompt';
import { discoverSkillFiles } from './skills/discovery';
import {
  SkillInclusion,
  type AgentSkill,
  type SkillName,
} from './skills/model';
import { makeToolSet, toolRegistry } from './tools';
import { getActivatedSkillsFromMessages } from './tools/tool-registry/skill';

export const enum StatusFlag {
  NONE = 0,
  STREAMING = 1 << 0,
  COMPACTING_CONTEXT = 1 << 1,
  COMPACTING_CONTEXT_FAILED = 1 << 2,
  LOADING_SKILLS = 1 << 3,
  ERROR_LOADING_SKILLS = 1 << 4,
  LOADING_MCPS = 1 << 5,
  ERROR_LOADING_MCPS = 1 << 6,
  ERROR_STREAMING = 1 << 7,
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

export const enum AgentEvents {
  MODEL_CHANGE = 'model-change',
  MESSAGE_QUEUE_SIZE_CHANGE = 'message-queue-change',
  MESSAGE_DELTA = 'message-delta',
  REASONING_EFFORT_CHANGE = 'reasoning-effort-change',
  AUTO_MODE_CHANGE = 'auto-mode-change',
  SKILL_LOADED = 'skill-loaded',
  SKILL_ACTIVATED = 'skill-activated',
  SKILL_DEACTIVATED = 'skill-deactivated',
  MCPS_LOADED = 'mcps-loaded',
}

interface AgentEventMap {
  [AgentEvents.MESSAGE_DELTA]: [Message];
  [AgentEvents.REASONING_EFFORT_CHANGE]: [ReasoningEffort];
  [AgentEvents.MODEL_CHANGE]: [ModelDefinition];
  [AgentEvents.AUTO_MODE_CHANGE]: [boolean];
  [AgentEvents.SKILL_LOADED]: [AgentSkill];
  [AgentEvents.SKILL_ACTIVATED]: [AgentSkill];
  [AgentEvents.SKILL_DEACTIVATED]: [AgentSkill];
  [AgentEvents.MCPS_LOADED]: [];
}

export interface AgentBaseProps {
  signal: AbortSignal;
  cwd: string;
  systemPrompt?: string;
}

export interface StatefulAgentSkill extends AgentSkill {
  active?: boolean;
}

export function isAlwaysIncluded(skill: AgentSkill): boolean {
  return skill.inclusion === SkillInclusion.ALWAYS;
}

export function isActiveSkill(skill: StatefulAgentSkill): boolean {
  return skill.active ?? isAlwaysIncluded(skill);
}

export type StatefulSkillMap = Map<SkillName, StatefulAgentSkill>;

export abstract class AgentBase extends EventEmitter<AgentEventMap> {
  protected readonly _taskList: TaskList;
  protected readonly _fileCache: FileCache;
  protected readonly _context: ContextStore;
  protected readonly _contextCompactor = new ContextCompactor();
  protected readonly _mcpServers = new Set<MCP>();
  protected readonly _notifier: Notifier;
  protected readonly _toolset: ToolSet;
  protected readonly _skills: StatefulSkillMap = new Map();
  protected readonly signal: AbortSignal;
  protected readonly _cwd: string;
  protected _reasoningEffort: ReasoningEffort = ReasoningEffort.MEDIUM;
  protected _model: ModelDefinition = DEFAULT_MODEL;
  protected _systemPrompt?: string;
  /** On-demand skills whose body is present in the conversation history. */
  private readonly _skillsInContext = new Set<SkillName>();

  protected invalidateSystemPrompt(): void {
    this._systemPrompt = undefined;
  }

  protected _status: BitSet<StatusFlag> = new BitSet<StatusFlag>(
    StatusFlag.NONE
  );

  protected constructor({ signal, cwd, systemPrompt }: AgentBaseProps) {
    super();
    this.signal = signal;
    this._cwd = cwd;
    this._systemPrompt = systemPrompt;
    this._taskList = new TaskListImpl();
    this._fileCache = new FileCacheImpl();
    this._context = new ContextStore(cwd);
    this._notifier = new NotifierImpl();
    this._toolset = makeToolSet(toolRegistry, this._notifier, signal);
  }

  public get taskList(): TaskList {
    return this._taskList;
  }

  public get fileCache(): FileCache {
    return this._fileCache;
  }

  public get model(): ModelDefinition {
    return this._model;
  }

  public set model(model: ModelDefinition) {
    this._model = model;
    this.emit(AgentEvents.MODEL_CHANGE, model);
  }

  public get reasoningEffort(): ReasoningEffort {
    return this._reasoningEffort;
  }

  public set reasoningEffort(effort: ReasoningEffort) {
    if (this._reasoningEffort !== effort) {
      this.emit(AgentEvents.REASONING_EFFORT_CHANGE, effort);
    }

    this._reasoningEffort = effort;
  }

  public get mcpServers(): MCP[] {
    return Array.from(this._mcpServers);
  }

  public findSkill(name: string): Nullable<StatefulAgentSkill> {
    return this._skills.get(name);
  }

  public get skills(): AgentSkill[] {
    return Array.from(this._skills.values());
  }

  public loadSkill(skill: AgentSkill): void {
    this._skills.set(skill.name, {
      ...skill,
      active: skill.inclusion === SkillInclusion.ALWAYS,
    });
    this.invalidateSystemPrompt();
    this.emit(AgentEvents.SKILL_LOADED, skill);
  }

  public activateSkill(name: SkillName): void {
    this.setSkillActiveState(name, true);
    this.emit(AgentEvents.SKILL_ACTIVATED, this.getSkill(name));
  }

  public deactivateSkill(name: SkillName): void {
    this.setSkillActiveState(name, false);
    this.emit(AgentEvents.SKILL_DEACTIVATED, this.getSkill(name));
  }

  private setSkillActiveState(name: SkillName, active: boolean): void {
    const skill = this.getSkill(name);
    this._skills.set(name, { ...skill, active });
  }

  private getSkill(name: SkillName): AgentSkill {
    const skill = this._skills.get(name);
    if (isNil(skill)) {
      throw new Error(`Skill \`${name}\` not found`);
    }
    return skill;
  }

  public async loadSkills(): Promise<boolean> {
    try {
      this._status.update({
        set: [StatusFlag.LOADING_SKILLS],
        clear: [StatusFlag.ERROR_LOADING_SKILLS],
      });
      const skills = await discoverSkillFiles();
      skills.forEach(skill => this.loadSkill(skill));
      return true;
    } catch {
      this._status.update({
        set: [StatusFlag.ERROR_LOADING_SKILLS],
        clear: [StatusFlag.LOADING_SKILLS],
      });
      return false;
    }
  }

  public async loadMcpServers(): Promise<boolean> {
    this._status.update({
      set: [StatusFlag.LOADING_MCPS],
      clear: [StatusFlag.ERROR_LOADING_MCPS],
    });
    try {
      const servers = await loadMcpConfig(this.signal);
      servers.forEach(server => this.registerMcpServer(server));
      this._status.clear(StatusFlag.LOADING_MCPS);
      return true;
    } catch {
      this._status.update({
        set: [StatusFlag.ERROR_LOADING_MCPS],
        clear: [StatusFlag.LOADING_MCPS],
      });
      return false;
    } finally {
      this.emit(AgentEvents.MCPS_LOADED);
    }
  }

  protected registerMcpServer(mcpServer: MCP): void {
    this._mcpServers.add(mcpServer);
  }

  public get systemPrompt(): string {
    return this._systemPrompt ?? '';
  }

  /**
   * Appends skill activations and deactivations the model has not seen yet,
   * e.g. ones toggled by the user between turns. Must run at a turn boundary
   * so the history stays append-only for the provider's prompt cache.
   */
  protected recordSkillStateChanges(): void {
    const activated = this._skills
      .values()
      .filter(
        skill =>
          isActiveSkill(skill) &&
          !isAlwaysIncluded(skill) &&
          !this._skillsInContext.has(skill.name)
      )
      .toArray();
    const deactivated = Array.from(this._skillsInContext).filter(
      name => !this.isSkillActive(name)
    );

    const reminder = constructSkillStateReminder({ activated, deactivated });
    if (isNil(reminder)) return;

    this._context.pushUser(reminder);
    activated.forEach(skill => this._skillsInContext.add(skill.name));
    deactivated.forEach(name => this._skillsInContext.delete(name));
  }

  /** Commits a turn's responses, noting skill bodies its `use_skill` calls delivered. */
  protected appendResponseToContext(messages: readonly ModelMessage[]): void {
    this._context.pushResponse(messages);
    getActivatedSkillsFromMessages(messages).forEach(name =>
      this._skillsInContext.add(name)
    );
  }

  private isSkillActive(name: SkillName): boolean {
    const skill = this._skills.get(name);
    return isNotNil(skill) && isActiveSkill(skill);
  }

  protected clearContext(): void {
    this._context.clear();
    this._skillsInContext.clear();
  }

  public get status(): BitSet<StatusFlag> {
    return this._status;
  }
}

export function throwIfAborted(signal: AbortSignal, message: string): void {
  if (signal.aborted) throw new Error(message);
}
