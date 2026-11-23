import type { ToolIdentifier } from '../agent/tools';

interface IMessage {
  id: string;
  content: string;
  immutable?: boolean;
}

export interface UserMessage extends IMessage {
  type: 'user';
  attachedFiles?: string[];
}

export interface AssistantMessage extends IMessage {
  type: 'assistant';
  metadata?: object;
}

export interface GenericMessage extends IMessage {
  type: 'generic';
  loading?: boolean;
  failure?: boolean;
  /** Present when the message was emitted by a tool execution; the tool's
   *  internal name. Absent for other generic messages (debug output, agent
   *  failures, command feedback), which must never participate in collapsing. */
  toolCall?: string;
  /** Present on messages that aggregate (collapse) consecutive completed tool
   *  calls into a single line. */
  collapsed?: CollapsedToolCalls;
}

export interface CollapsedToolCalls {
  /** Total number of tool calls aggregated into this message. */
  count: number;
  /** Tool internal name → number of calls collapsed for that tool, in the
   *  order the tools first appeared. */
  tools: Partial<Record<ToolIdentifier, number>>;
}

export type Message = UserMessage | AssistantMessage | GenericMessage;
