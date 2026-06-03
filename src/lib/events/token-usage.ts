import { emitEvent, EventName, type TokenConsumeProps } from './events';

export function emitConsumeTokenEvent(props: TokenConsumeProps): void {
  emitEvent(EventName.CONSUME_TOKENS, props);
}
