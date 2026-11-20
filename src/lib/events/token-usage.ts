import {
  emitEvent,
  EventName,
  type ContextUsageProps,
  type TokenConsumeProps,
} from './events';

/** Reports billed token usage, summed per {@link TokenConsumeProps.source}. */
export function emitConsumeTokenEvent(props: TokenConsumeProps): void {
  emitEvent(EventName.CONSUME_TOKENS, props);
}

/**
 * Reports the current primary context-window occupancy as an absolute
 * snapshot. Consumers replace their stored value rather than accumulating.
 */
export function emitContextUsageEvent(props: ContextUsageProps): void {
  emitEvent(EventName.CONTEXT_USAGE, props);
}
