import { type AgentContext } from '../rendering/context';
import { type Message } from './messages';

export const eventTarget = new EventTarget();

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

export function emitEvent<E extends Event>(event: E): void {
  eventTarget.dispatchEvent(event);
}

export const enum EventName {
  REQUEST_USER_INPUT = 'request-user-input',
  USER_INPUT_RESPONSE = 'user-input-response',
  AGENT_MESSAGE = 'agent-message',
  SYNC_AGENT_CONTEXT = 'sync-agent-context-context',
  AGENT_CONTEXT_SYNC_RESULT = 'agent-context-sync-result',
}

export interface InputOption {
  id: string;
  label: string;
}
export interface UserInputRequest {
  title: string;
  description: string;
  options: InputOption[];
}

export class UserInputRequestEvent extends CustomEvent<UserInputRequest> {
  constructor(inputRequest: UserInputRequest) {
    super(EventName.REQUEST_USER_INPUT, { detail: inputRequest });
  }
}

export class UserInputResponseEvent extends CustomEvent<InputOption> {
  constructor(option: InputOption) {
    super(EventName.USER_INPUT_RESPONSE, { detail: option });
  }
}
export class AgentMessageEvent extends CustomEvent<Message> {
  constructor(message: Message) {
    super(EventName.AGENT_MESSAGE, { detail: message });
  }
}

export class SyncAgentContextEvent extends CustomEvent<never> {
  constructor() {
    super(EventName.SYNC_AGENT_CONTEXT);
  }
}

export class AgentContextSyncResult extends CustomEvent<AgentContext> {
  constructor(context: AgentContext) {
    super(EventName.AGENT_CONTEXT_SYNC_RESULT, { detail: context });
  }
}
