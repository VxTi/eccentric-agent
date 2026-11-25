import type { TaskComplexity } from '../agent/inference';
import type { ToolIdentifier } from '../agent/tools';
import type { MakeOptional } from './types';

export enum MessageType {
  USER = 'user',
  ASSISTANT = 'assistant',
  GENERIC = 'generic',
  REASONING = 'reasoning',
  DELEGATED_TASK = 'delegated_task',
}

interface IMessage {
  id: string;
  content: string;
}

interface ILoadable {
  loading?: boolean;
}

export interface UserMessage extends IMessage {
  type: MessageType.USER;
  attachedFiles?: string[];
}

export interface AssistantMessage extends IMessage {
  type: MessageType.ASSISTANT;
  metadata?: object;
}

export interface GenericMessage extends IMessage, ILoadable {
  type: MessageType.GENERIC;
  failure?: boolean;
  /** Present when the message was emitted by a tool execution; the tool's
   *  internal name. Absent for other generic messages (debug output, agent
   *  failures, command feedback), which must never participate in collapsing. */
  toolCall?: ToolIdentifier;
  /** Present on messages that aggregate (collapse) consecutive completed tool
   *  calls into a single line. */
  collapsed?: CollapsedToolCalls;
}

export interface ThoughtMessage extends IMessage, ILoadable {
  type: MessageType.REASONING;
}

/** Mirrors the `delegate_task` tool's task specification. */
export interface DelegatedTaskSpec {
  name: string;
  goal: string;
  dependsOn?: string[];
  complexity?: TaskComplexity;
}

/** Mirrors the `delegate_task` tool's per-task result. */
export interface DelegatedTaskResult {
  taskName: string;
  taskResult: string;
  success: boolean;
}

export interface DelegatedTaskMessage extends IMessage, ILoadable {
  type: MessageType.DELEGATED_TASK;
  id: string;
  tasks: DelegatedTaskSpec[];
  results?: DelegatedTaskResult[];
}

export interface CollapsedToolCalls {
  /** Total number of tool calls aggregated into this message. */
  count: number;
  /** Tool internal name → number of calls collapsed for that tool, in the
   *  order the tools first appeared. */
  tools: Partial<Record<ToolIdentifier, number>>;
}

export type Message =
  | UserMessage
  | AssistantMessage
  | GenericMessage
  | ThoughtMessage
  | DelegatedTaskMessage;

/** A `Message` with `id` optional, keeping each variant's own fields intact.
 *  Must distribute over the union: applying `MakeOptional` to the union
 *  directly collapses it and loses variant-specific fields. */
export type EmittableMessage<M extends Message = Message> = M extends unknown
  ? MakeOptional<M, 'id'>
  : never;
