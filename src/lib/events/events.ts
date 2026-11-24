import { type NonEmptyArray } from '@vxti/typed';
import type { Message } from '../types/messages';

export const eventTarget = new EventTarget();

export const enum EventName {
  REQUEST_INPUT = 'request-user-input',
  INPUT_RESPONSE = 'user-input-response',
  INPUT_CANCEL = 'user-input-cancel',
  AGENT_MESSAGE = 'agent-message',
  AGENT_REASONING = 'agent-reasoning',
  RESPONSE_TOKENS = 'response-tokens',
  CONTEXT_USAGE = 'context-usage',
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
  /**
   * When true, the dialog lets the user dismiss the request with ESC. This
   * settles the awaiting caller as cancelled instead of answering it.
   */
  cancellable?: boolean;
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

export class UserInputCancelEvent extends CustomEvent<{ channelId: string }> {
  constructor(channelId: string) {
    super(EventName.INPUT_CANCEL, { detail: { channelId } });
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

/**
 * Response tokens produced since the last reset, summed across every agent
 * (primary and sub-agents). Cumulative — consumers add to their running total;
 * `reset` zeroes it.
 */
export interface ResponseTokensProps {
  output: number;
  reset?: boolean;
}
export class ResponseTokensEvent extends CustomEvent<ResponseTokensProps> {
  constructor(detail: ResponseTokensProps) {
    super(EventName.RESPONSE_TOKENS, { detail });
  }
}

/**
 * The absolute occupancy of the primary context window after the latest turn:
 * `input` is the size of the prompt last sent (system + conversation), `output`
 * the size of the reply that was appended to it. These are a running snapshot
 * to be *replaced*, not summed — each request re-sends the whole context, so
 * summing per-request figures would multiply the same tokens. Sub-agent work
 * never contributes here; it does not occupy the main window.
 */
export interface ContextUsageProps {
  input: number;
  output: number;
}
export class ContextUsageEvent extends CustomEvent<ContextUsageProps> {
  constructor(detail: ContextUsageProps) {
    super(EventName.CONTEXT_USAGE, { detail });
  }
}

const EventConstructorRegistry = {
  [EventName.REQUEST_INPUT]: UserInputRequestEvent,
  [EventName.INPUT_RESPONSE]: UserInputResponseEvent,
  [EventName.AGENT_MESSAGE]: AgentMessageEvent,
  [EventName.AGENT_REASONING]: AgentReasoningEvent,
  [EventName.RESPONSE_TOKENS]: ResponseTokensEvent,
  [EventName.CONTEXT_USAGE]: ContextUsageEvent,
} as const satisfies Record<EventName, any>;

type EventRegistry = {
  [EventName.REQUEST_INPUT]: UserInputRequestEvent;
  [EventName.INPUT_RESPONSE]: UserInputResponseEvent;
  [EventName.AGENT_MESSAGE]: AgentMessageEvent;
  [EventName.AGENT_REASONING]: AgentReasoningEvent;
  [EventName.RESPONSE_TOKENS]: ResponseTokensEvent;
  [EventName.CONTEXT_USAGE]: ContextUsageEvent;
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
