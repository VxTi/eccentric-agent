import { useInput } from 'ink';
import { useEffect, useRef } from 'react';

const WHEEL_INPUT_PATTERN = /^\[?<(\d+);\d+;\d+[Mm]$/;
const WHEEL_UP_ANSI_CODE = 64;
const WHEEL_DOWN_ANSI_CODE = 65;
const SCROLL_STEP = 1;

type ScrollHandlerFn = (scrollDy: number) => any;

export function useScroll(callback: ScrollHandlerFn) {
  const lastScrollTime = useRef<number>(Date.now());

  useEffect(() => {
    lastScrollTime.current = Date.now();
    return () => {};
  });

  useInput(input => {
    const button = Number(WHEEL_INPUT_PATTERN.exec(input)?.[1]);

    if (button === WHEEL_UP_ANSI_CODE) {
      callback(SCROLL_STEP);
    } else if (button === WHEEL_DOWN_ANSI_CODE) {
      callback(-SCROLL_STEP);
    }
  });
}
