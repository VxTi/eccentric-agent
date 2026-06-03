import {
  type AssistantMessage,
  type GenericMessage,
  type UserMessage,
} from '../types/messages';
import { type MakeOptional } from '../types/types';
import {
  emitEvent,
  EventName,
  type InputOption,
  subscribeEvent,
  unsubscribeEvent,
  type UserInputRequest,
  type UserInputResponseEvent,
} from './events';
import { v7 as uuid } from 'uuid';

export function requestUserInput(
  props: UserInputRequest
): Promise<InputOption[]> {
  return new Promise(resolve => {
    const handler = (event: UserInputResponseEvent) => {
      unsubscribeEvent(EventName.INPUT_RESPONSE, handler);
      resolve(event.detail);
    };

    subscribeEvent(EventName.INPUT_RESPONSE, handler);
    emitEvent(EventName.REQUEST_INPUT, props);
  });
}

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
