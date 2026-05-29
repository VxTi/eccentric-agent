interface IMessage {
  content: string;
}

export interface UserMessage extends IMessage {
  type: 'user';
  attachedFiles: string[];
}

export interface AssistantMessage extends IMessage {
  type: 'assistant';
  metadata?: object;
}

export interface GenericMessage extends IMessage {
  type: 'generic';
}

export type Message = UserMessage | AssistantMessage | GenericMessage;
