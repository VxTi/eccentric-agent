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

/** Usage of one completed step (LLM call) of an agent. */
export interface StepUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** Reports one step's output, added to the running ↓ total across all agents. */
export function emitResponseStepUsage(usage: StepUsage): void {
  emitResponseTokensEvent({ output: usage.outputTokens ?? 0 });
}

/**
 * Reports one completed step of the primary agent: bumps the ↓ counter and
 * refreshes the occupancy snapshot going into the next step — the step's
 * prompt (which already contains the whole conversation) plus its appended
 * reply. Per-step figures must never be summed; each snapshot replaces the
 * previous one.
 */
export function emitPrimaryStepUsage(usage: StepUsage): void {
  emitResponseStepUsage(usage);
  emitContextUsageEvent({
    input: usage.inputTokens ?? 0,
    output: usage.outputTokens ?? 0,
  });
}
