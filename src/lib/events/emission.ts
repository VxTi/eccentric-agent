import { emitEvent, EventName } from './events';

export function emitConsumeTokenEvent(input: number, output: number): void {
  emitEvent(EventName.CONSUME_TOKENS, input, output);
}
