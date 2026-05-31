import { type Message } from '../types/messages';
import {
  emitEvent,
  EventName,
  type InputOption,
  subscribeEvent,
  unsubscribeEvent,
  type UserInputRequest,
  type UserInputResponseEvent,
} from './events';

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

export function emitAgentMessage(message: Message): void {
  emitEvent(EventName.AGENT_MESSAGE, message);
}
