import { type Message } from '../../../lib/types/messages';

export interface CommonProps<T extends Message> extends BaseProps<T> {
  containerHeight: number;
  scrollOffset: number;
}

export interface BaseProps<T extends Message> {
  message: T;
  /**
   * When set, only the last `maxLines` rendered lines are shown (tail-follow).
   * Used for the message that is still streaming: it lives in Ink's dynamic
   * redraw region, which cannot be erased once it grows taller than the
   * terminal, so its height must be bounded to the viewport. The full message
   * is rendered unbounded once it finalizes and moves into <Static>.
   */
  maxLines?: number;
}
