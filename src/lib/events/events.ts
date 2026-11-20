import { type NonEmptyArray } from '@vxti/typed';
import type { Message } from '../types/messages';

export const eventTarget = new EventTarget();

export const enum EventName {
  REQUEST_INPUT = 'request-user-input',
  INPUT_RESPONSE = 'user-input-response',
  AGENT_MESSAGE = 'agent-message',
  AGENT_REASONING = 'agent-reasoning',
  CONSUME_TOKENS = 'consume-tokens',
}

export interface InputOption<T = string> {
  label: string;
  value: T;
}

/**
 * Reserved `InputOption.id` for free-text answers typed into the input dialog.
 * When a request sets `allowTextInput`, a free-text submission resolves as a
 * single option carrying this id and the typed text as its label. Request
 * authors must not define an option with this id.
 */
export const FREE_TEXT_INPUT_ID = 'free-text';

export interface UserInputRequest<T = string> {
  title?: string;
  description?: string;
  options: InputOption<T>[];
  allowMultiple?: boolean;
  /** When true, the dialog offers a row to type a custom free-text answer. */
  allowTextInput?: boolean;
  channelId: string;
}

export class UserInputRequestEvent<T = any> extends CustomEvent<
  UserInputRequest<T>
> {
  constructor(request: UserInputRequest<T>) {
    super(EventName.REQUEST_INPUT, { detail: request });
  }
}

export class UserInputResponseEvent<T = string> extends CustomEvent<{
  options: NonEmptyArray<InputOption<T>>;
  channelId: string;
}> {
  constructor(options: NonEmptyArray<InputOption<T>>, channelId: string) {
    super(EventName.INPUT_RESPONSE, { detail: { options, channelId } });
  }
}

export class AgentMessageEvent extends CustomEvent<Message> {
  constructor(message: Message) {
    super(EventName.AGENT_MESSAGE, { detail: message });
  }
}

/**
 * Whether the model is presently producing reasoning. The reasoning text itself
 * is not surfaced yet — the UI derives a fixed indicator from this flag.
 */
export interface ReasoningState {
  active: boolean;
}

export class AgentReasoningEvent extends CustomEvent<ReasoningState> {
  constructor(detail: ReasoningState) {
    super(EventName.AGENT_REASONING, { detail });
  }
}

export const enum TokenSource {
  PRIMARY = 'primary',
  // Secondary tasks are those that don't fill the main context window (e.g., sub agents)
  SECONDARY = 'secondary',
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
  [EventName.AGENT_REASONING]: AgentReasoningEvent,
  [EventName.CONSUME_TOKENS]: ConsumeTokenEvent,
} as const satisfies Record<EventName, any>;

type EventRegistry = {
  [EventName.REQUEST_INPUT]: UserInputRequestEvent;
  [EventName.INPUT_RESPONSE]: UserInputResponseEvent;
  [EventName.AGENT_MESSAGE]: AgentMessageEvent;
  [EventName.AGENT_REASONING]: AgentReasoningEvent;
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
