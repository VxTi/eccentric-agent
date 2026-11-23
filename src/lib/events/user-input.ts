import { isNil, isNotNil, type NonEmptyArray } from '@vxti/typed';
import { v7 as uuid } from 'uuid';
import {
  emitEvent,
  EventName,
  type InputOption,
  subscribeEvent,
  unsubscribeEvent,
  type UserInputRequest,
  type UserInputResponseEvent,
} from './events';

export const CHANNEL_ID_NONE = 'channel$none';

export function requestUserInput<T = string>(
  props: Omit<UserInputRequest<T>, 'channelId'> & {
    /**
     * Rejects the promise if no user response arrives within this many
     * milliseconds. Callers must decide how to treat the rejection (e.g. as
     * a denial); it is never silently swallowed.
     */
    timeoutMs?: number;
    /**
     * Rejects the promise as soon as this signal aborts (or immediately when
     * the signal is already aborted), so a cancelled caller never waits on a
     * user who will never answer.
     */
    signal?: AbortSignal;
  }
): Promise<NonEmptyArray<InputOption<T>>> {
  const { timeoutMs, signal, ...request } = props;
  const channelId = uuid();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      rejectWith(
        `User input request "${request.title ?? channelId}" was aborted.`
      );
    };

    const cleanup = () => {
      unsubscribeEvent(EventName.INPUT_RESPONSE, handler);
      if (isNotNil(timer)) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    const rejectWith = (reason: string) => {
      cleanup();
      reject(new Error(reason));
    };

    const handler = (event: UserInputResponseEvent<any>) => {
      // Ensure we don't accept an approval event of another channel
      if (event.detail.channelId !== channelId) return;

      cleanup();
      resolve(event.detail.options);
    };

    const timer = !isNil(timeoutMs)
      ? setTimeout(
          () =>
            rejectWith(
              `User input request "${request.title ?? channelId}" timed out after ${timeoutMs} ms.`
            ),
          timeoutMs
        )
      : undefined;

    if (signal?.aborted) {
      onAbort();
      return;
    }

    subscribeEvent(EventName.INPUT_RESPONSE, handler);
    signal?.addEventListener('abort', onAbort);
    emitEvent(EventName.REQUEST_INPUT, { ...request, channelId });
  });
}
