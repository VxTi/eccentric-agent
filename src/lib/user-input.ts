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
  UserPromptEvent,
} from './events';

export function requestUserInput(props: UserInputRequest): Promise<InputOption> {
  return new Promise(resolve => {
    const handler = (event: UserInputResponseEvent) => {
      unsubscribeEvent(EventName.USER_INPUT_RESPONSE, handler);
      resolve(event.detail);
    };

    emitEvent(new UserInputRequestEvent(props));
    subscribeEvent(EventName.USER_INPUT_RESPONSE, handler);
  });
}

export function requestPrompt(prompt: string): void {
  emitEvent(new UserPromptEvent(prompt));
}

export function emitAgentMessage(message: string): void {
  emitEvent(new AgentMessageEvent(message));
}
