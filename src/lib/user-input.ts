import {
  AgentMessageEvent,
  emitEvent,
  EventName,
  type InputOption,
  subscribeEvent,
  unsubscribeEvent,
  type UserInputRequest,
  UserInputRequestEvent,
  type UserInputResponseEvent,
} from './events';
import { type Message } from './messages';

export function requestUserInput(
  props: UserInputRequest
): Promise<InputOption[]> {
  return new Promise(resolve => {
    const handler = (event: UserInputResponseEvent) => {
      unsubscribeEvent(EventName.USER_INPUT_RESPONSE, handler);
      resolve(event.detail);
    };

    subscribeEvent(EventName.USER_INPUT_RESPONSE, handler);
    emitEvent(new UserInputRequestEvent(props));
  });
}

export function emitAgentMessage(message: Message): void {
  emitEvent(new AgentMessageEvent(message));
}
