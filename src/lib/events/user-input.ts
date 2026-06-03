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

export function requestUserInput(
  props: Omit<UserInputRequest, 'channelId'>
): Promise<InputOption[]> {
  const channelId = uuid();
  return new Promise(resolve => {
    const handler = (event: UserInputResponseEvent) => {
      // Ensure we don't accept an approval event of another channel
      if (event.detail.channelId !== channelId) return;

      unsubscribeEvent(EventName.INPUT_RESPONSE, handler);
      resolve(event.detail.options);
    };

    subscribeEvent(EventName.INPUT_RESPONSE, handler);
    emitEvent(EventName.REQUEST_INPUT, { ...props, channelId });
  });
}
