import type { UniqueArray } from '../common/types';
import type {
  BackgroundColor,
  TextAlignment,
  TextColor,
  TextStyle,
} from './styling';

export interface TextFragment {
  type: 'text';
  content: string;
  color?: TextColor;
  background?: BackgroundColor;
  styles?: TextStyle[];
}

export interface TextBlockFragment {
  type: 'text-block';
  align?: TextAlignment;
  content: string;
}

export interface LineFragment {
  type: 'line';
  textFragments: TextFragment[];
}

export type BufferFragments = LineFragment | TextBlockFragment;

export function textBlock(
  props: Omit<TextBlockFragment, 'type'>
): TextBlockFragment {
  return { ...props, type: 'text-block' };
}

export function lineFragment(...textFragments: TextFragment[]): LineFragment {
  return {
    type: 'line',
    textFragments,
  };
}

export function textFragment<T extends TextStyle[]>(
  content: string,
  color?: TextColor,
  styles?: [...UniqueArray<T>],
  background?: BackgroundColor
): TextFragment {
  return {
    type: 'text',
    content,
    color,
    background,
    styles,
  };
}
