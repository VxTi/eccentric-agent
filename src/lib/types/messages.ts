interface IMessage {
  id: string;
  content: string;
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
}

export type Message = UserMessage | AssistantMessage | GenericMessage;
