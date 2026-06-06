import { type Message } from '../../../lib/types/messages';

export interface CommonProps<T extends Message> {
  viewportHeight: number;
  scrollOffset: number;
  message: T;
}
