import { type AgentContext } from '../../rendering/context';
import { type Message } from '../types/messages';

export const eventTarget = new EventTarget();

export const enum EventName {
  REQUEST_INPUT = 'request-user-input',
  INPUT_RESPONSE = 'user-input-response',
  AGENT_MESSAGE = 'agent-message',
  CONTEXT_SYNC_REQUEST = 'sync-agent-context-context',
  CONTEXT_SYNC_RESULT = 'agent-context-sync-result',
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
}

export class UserInputRequestEvent extends CustomEvent<UserInputRequest> {
  constructor(inputRequest: UserInputRequest) {
    super(EventName.REQUEST_INPUT, { detail: inputRequest });
  }
}

export class UserInputResponseEvent extends CustomEvent<InputOption[]> {
  constructor(options: InputOption[]) {
    super(EventName.INPUT_RESPONSE, { detail: options });
  }
}

export class AgentMessageEvent extends CustomEvent<Message> {
  constructor(message: Message) {
    super(EventName.AGENT_MESSAGE, { detail: message });
  }
}

export class SyncAgentContextEvent extends CustomEvent<never> {
  constructor() {
    super(EventName.CONTEXT_SYNC_REQUEST);
  }
}

export class AgentContextSyncResult extends CustomEvent<AgentContext> {
  constructor(context: AgentContext) {
    super(EventName.CONTEXT_SYNC_RESULT, { detail: context });
  }
}
export const enum TokenSource {
  PRIMARY = 'primary',
  SUB_TASK = 'sub-task',
}
export interface TokenConsumeProps {
  input: number;
  output: number;
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
  [EventName.CONTEXT_SYNC_REQUEST]: SyncAgentContextEvent,
  [EventName.CONTEXT_SYNC_RESULT]: AgentContextSyncResult,
  [EventName.CONSUME_TOKENS]: ConsumeTokenEvent,
} as const satisfies Record<EventName, any>;

type EventRegistry = {
  [EventName.REQUEST_INPUT]: UserInputRequestEvent;
  [EventName.INPUT_RESPONSE]: UserInputResponseEvent;
  [EventName.AGENT_MESSAGE]: AgentMessageEvent;
  [EventName.CONTEXT_SYNC_REQUEST]: SyncAgentContextEvent;
  [EventName.CONTEXT_SYNC_RESULT]: AgentContextSyncResult;
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
