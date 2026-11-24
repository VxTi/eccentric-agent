import type { ToolIdentifier } from '../agent/tools';
import type { MakeOptional } from './types';

export enum MessageType {
  USER = 'user',
  ASSISTANT = 'assistant',
  GENERIC = 'generic',
  TOOL_CALL = 'tool_call',
  REASONING = 'reasoning',
}

interface IMessage {
  id: string;
  content: string;
}

interface IPendable {
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

export interface GenericMessage extends IMessage, IPendable {
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

export interface ThoughtMessage extends IMessage, IPendable {
  type: MessageType.REASONING;
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
  | ThoughtMessage;

/** A `Message` with `id` optional, keeping each variant's own fields intact.
 *  Must distribute over the union: applying `MakeOptional` to the union
 *  directly collapses it and loses variant-specific fields. */
export type EmittableMessage<M extends Message = Message> = M extends unknown
  ? MakeOptional<M, 'id'>
  : never;
