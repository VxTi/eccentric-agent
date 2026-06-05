import { v7 as uuid } from 'uuid';
import type {
  AssistantMessage,
  GenericMessage,
  UserMessage,
} from '../types/messages';
import type { MakeOptional } from '../types/types';
import { emitEvent, EventName } from './events';

export function emitMessage(
  // Unfortunately we have to construct it like this, since omitting it from the union type
  // "Message" means that TypeScript loses type information, resulting in disallowing
  // certian union-specific fields
  message:
    | MakeOptional<UserMessage, 'id'>
    | MakeOptional<AssistantMessage, 'id'>
    | MakeOptional<GenericMessage, 'id'>
): void {
  emitEvent(EventName.AGENT_MESSAGE, { ...message, id: message.id ?? uuid() });
}

export function debug(message: string, ...args: any[]): void {
  // if (process.env.NODE_ENV !== 'production') {
  emitMessage({
    type: 'generic',
    content: `${message} ${args.map(a => JSON.stringify(a)).join(', ')}`,
  });
  // }
}
