import { type Message } from '../../../lib/types/messages';

export interface CommonProps<T extends Message> extends BaseProps<T> {
  containerHeight: number;
  scrollOffset: number;
}

export interface BaseProps<T extends Message> {
  message: T;
}
