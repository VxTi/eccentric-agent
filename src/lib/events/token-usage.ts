import {
  emitEvent,
  EventName,
  type ContextUsageProps,
  type ResponseTokensProps,
} from './events';

/** Reports response tokens produced since the last reset, as a running sum. */
export function emitResponseTokensEvent(props: ResponseTokensProps): void {
  emitEvent(EventName.RESPONSE_TOKENS, props);
}

/**
 * Reports the current primary context-window occupancy as an absolute
 * snapshot. Consumers replace their stored value rather than accumulating.
 */
export function emitContextUsageEvent(props: ContextUsageProps): void {
  emitEvent(EventName.CONTEXT_USAGE, props);
}
