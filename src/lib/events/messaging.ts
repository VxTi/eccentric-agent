import { v7 as uuid } from 'uuid';
import { MessageType, type EmittableMessage } from '../types/messages';
import { emitEvent, EventName } from './events';

export function emitMessage(message: EmittableMessage): void {
  emitEvent(EventName.AGENT_MESSAGE, { ...message, id: message.id ?? uuid() });
}

export function debug(message: string, ...args: any[]): void {
  if (process.env.NODE_ENV === 'debug') {
    emitMessage({
      type: MessageType.GENERIC,
      content: `${message} ${args.map(a => JSON.stringify(a)).join(', ')}`,
    });
  }
}
