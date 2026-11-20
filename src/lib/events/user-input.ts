import { type NonEmptyArray } from '@vxti/typed';
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
  props: Omit<UserInputRequest<T>, 'channelId'>
): Promise<NonEmptyArray<InputOption<T>>> {
  const channelId = uuid();
  return new Promise(resolve => {
    const handler = (event: UserInputResponseEvent<any>) => {
      // Ensure we don't accept an approval event of another channel
      if (event.detail.channelId !== channelId) return;

      unsubscribeEvent(EventName.INPUT_RESPONSE, handler);
      resolve(event.detail.options);
    };

    subscribeEvent(EventName.INPUT_RESPONSE, handler);
    emitEvent(EventName.REQUEST_INPUT, { ...props, channelId });
  });
}
