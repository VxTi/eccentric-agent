import { type DOMElement, useFocus, useInput } from 'ink';
import { type RefObject, useCallback, useId } from 'react';

const WHEEL_INPUT_PATTERN = /^\[?<(\d+);\d+;\d+[Mm]$/;
const WHEEL_UP_ANSI_CODE = 64;
const WHEEL_DOWN_ANSI_CODE = 65;
const SCROLL_STEP = 1;

export function useScroll<T extends DOMElement>(
  target: RefObject<T | undefined>
) {
  const id = useId();
  const { isFocused } = useFocus({ id });

  useInput(input => {
    if (!target.current || !isFocused) return;

    const button = Number(WHEEL_INPUT_PATTERN.exec(input)?.[1]);

    if (button === WHEEL_UP_ANSI_CODE) {
      setScrollOffset(prev => prev + SCROLL_STEP);
    } else if (button === WHEEL_DOWN_ANSI_CODE) {
      setScrollOffset(prev => prev - SCROLL_STEP);
    }
  });

  const onScroll = useCallback((deltaY: number) => {}, []);

  return { onScroll };
}
