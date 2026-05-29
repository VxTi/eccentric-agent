import { type AgentContext } from '../rendering/context';

export const eventTarget = new EventTarget();

export function subscribeEvent<E extends Event>(name: EventName, handler: (event: E) => any) {
  eventTarget.addEventListener(name, handler as never);
}

export function unsubscribeEvent<E extends Event>(name: EventName, handler: (event: E) => any) {
  eventTarget.removeEventListener(name, handler as never);
}

export function emitEvent<E extends Event>(event: E): void {
  eventTarget.dispatchEvent(event);
}

export const enum EventName {
  REQUEST_USER_INPUT = 'request-user-input',
  USER_INPUT_RESPONSE = 'user-input-response',
  USER_PROMPT = 'user-prompt',
  AGENT_MESSAGE = 'agent-message',
  SYNC_AGENT_CONTEXT = 'sync-agent-context-context',
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

export class UserPromptEvent extends CustomEvent<string> {
  constructor(prompt: string) {
    super(EventName.USER_PROMPT, { detail: prompt });
  }
}

export class AgentMessageEvent extends CustomEvent<string> {
  constructor(message: string) {
    super(EventName.AGENT_MESSAGE, { detail: message });
  }
}

type SyncContextRequest = { type: 'sync-context' };
type SyncContextResult = {
  type: 'sync-context-response';
  context: AgentContext;
};
export type SyncAgentContextProps = SyncContextRequest | SyncContextResult;

export class SyncAgentContextEvent extends CustomEvent<SyncAgentContextProps> {
  constructor(props: SyncAgentContextProps) {
    super(EventName.SYNC_AGENT_CONTEXT, { detail: props });
  }
}
