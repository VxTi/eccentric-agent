import { emitEvent, EventName, type ReasoningState } from './events';

export function emitReasoningState(state: ReasoningState): void {
  emitEvent(EventName.AGENT_REASONING, state);
}
