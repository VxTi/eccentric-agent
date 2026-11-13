import { type NonEmptyArray } from '@vxti/typed';
import { type Message } from '../types/messages';

export const eventTarget = new EventTarget();

export const enum EventName {
  REQUEST_INPUT = 'request-user-input',
  INPUT_RESPONSE = 'user-input-response',
  AGENT_MESSAGE = 'agent-message',
  CONSUME_TOKENS = 'consume-tokens',
}

export interface InputOption {
  id: string;
  label: string;
}
export interface UserInputRequest {
  title?: string;
  description?: string;
  options: InputOption[];
  allowMultiple?: boolean;
  channelId: string;
}

export class UserInputRequestEvent extends CustomEvent<UserInputRequest> {
  constructor(request: UserInputRequest) {
    super(EventName.REQUEST_INPUT, { detail: request });
  }
}

export class UserInputResponseEvent extends CustomEvent<{
  options: NonEmptyArray<InputOption>;
  channelId: string;
}> {
  constructor(options: NonEmptyArray<InputOption>, channelId: string) {
    super(EventName.INPUT_RESPONSE, { detail: { options, channelId } });
  }
}

export class AgentMessageEvent extends CustomEvent<Message> {
  constructor(message: Message) {
    super(EventName.AGENT_MESSAGE, { detail: message });
  }
}

export const enum TokenSource {
  PRIMARY = 'primary',
  SUB_TASK = 'sub-task',
}
export interface TokenConsumeProps {
  input: number;
  output: number;
  reset?: boolean;
  source: TokenSource;
}
export class ConsumeTokenEvent extends CustomEvent<TokenConsumeProps> {
  constructor(detail: TokenConsumeProps) {
    super(EventName.CONSUME_TOKENS, { detail });
  }
}

const EventConstructorRegistry = {
  [EventName.REQUEST_INPUT]: UserInputRequestEvent,
  [EventName.INPUT_RESPONSE]: UserInputResponseEvent,
  [EventName.AGENT_MESSAGE]: AgentMessageEvent,
  [EventName.CONSUME_TOKENS]: ConsumeTokenEvent,
} as const satisfies Record<EventName, any>;

type EventRegistry = {
  [EventName.REQUEST_INPUT]: UserInputRequestEvent;
  [EventName.INPUT_RESPONSE]: UserInputResponseEvent;
  [EventName.AGENT_MESSAGE]: AgentMessageEvent;
  [EventName.CONSUME_TOKENS]: ConsumeTokenEvent;
};

export function subscribeEvent<TEventName extends EventName>(
  name: TEventName,
  handler: (event: EventRegistry[TEventName]) => any
): void {
  eventTarget.addEventListener(name, handler as never);
}

export function unsubscribeEvent<TEventName extends EventName>(
  name: TEventName,
  handler: (event: EventRegistry[TEventName]) => any
): void {
  eventTarget.removeEventListener(name, handler as never);
}

export function eventOn<TEventName extends EventName>(
  name: TEventName,
  handler: (event: EventRegistry[TEventName]) => any
): () => void {
  subscribeEvent(name, handler);

  return () => unsubscribeEvent(name, handler);
}

export function emitEvent<TEventName extends EventName>(
  eventName: TEventName,
  ...parameters: ConstructorParameters<
    (typeof EventConstructorRegistry)[TEventName]
  >
): void {
  eventTarget.dispatchEvent(
    // eslint-disable-next-line
    // @ts-ignore
    new EventConstructorRegistry[eventName](...parameters)
  );
}
