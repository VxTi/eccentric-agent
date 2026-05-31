import { type AgentContext } from '../../rendering/context';
import { type Message } from '../types/messages';

export const eventTarget = new EventTarget();

export const enum EventName {
  REQUEST_INPUT = 'request-user-input',
  INPUT_RESPONSE = 'user-input-response',
  AGENT_MESSAGE = 'agent-message',
  CONTEXT_SYNC_REQUEST = 'sync-agent-context-context',
  CONTEXT_SYNC_RESULT = 'agent-context-sync-result',
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

const EventConstructorRegistry = {
  [EventName.REQUEST_INPUT]: UserInputRequestEvent,
  [EventName.INPUT_RESPONSE]: UserInputResponseEvent,
  [EventName.AGENT_MESSAGE]: AgentMessageEvent,
  [EventName.CONTEXT_SYNC_REQUEST]: SyncAgentContextEvent,
  [EventName.CONTEXT_SYNC_RESULT]: AgentContextSyncResult,
} as const;

type EventRegistry = typeof EventConstructorRegistry;

export function subscribeEvent<E extends Event>(
  name: EventName,
  handler: (event: E) => any
) {
  eventTarget.addEventListener(name, handler as never);
}

export function unsubscribeEvent<E extends Event>(
  name: EventName,
  handler: (event: E) => any
) {
  eventTarget.removeEventListener(name, handler as never);
}

export function emitEvent<TEventName extends EventName>(
  eventName: TEventName,
  ...parameters: ConstructorParameters<EventRegistry[TEventName]>
): void {
  eventTarget.dispatchEvent(
    new EventConstructorRegistry[eventName](parameters as never) // Sadly this can't be fixed
  );
}
