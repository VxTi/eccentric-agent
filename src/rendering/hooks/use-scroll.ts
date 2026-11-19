import { isNil } from '@vxti/typed';
import { useInput } from 'ink';
import { useEffect, useRef } from 'react';

const WHEEL_INPUT_PATTERN = /^\[?<(\d+);\d+;\d+[Mm]$/;
const WHEEL_UP_ANSI_CODE = 64;
const WHEEL_DOWN_ANSI_CODE = 65;
const SCROLL_STEP = 1;

type ScrollHandlerFn = (scrollDy: number) => any;

export function useScroll(callback: ScrollHandlerFn) {
  const lastScrollTimeMs = useRef<number>(Date.now());

  useEffect(() => {
    lastScrollTimeMs.current = Date.now();
    return () => {};
  });

  useInput(input => {
    const match = WHEEL_INPUT_PATTERN.exec(input)?.[1];
    if (isNil(match)) return;

    const dt = (Date.now() - lastScrollTimeMs.current) / 1_000;
    lastScrollTimeMs.current = Date.now();

    const button = Number.parseInt(match);

    const dir =
      button === WHEEL_UP_ANSI_CODE
        ? 1
        : button === WHEEL_DOWN_ANSI_CODE
          ? -1
          : 0;

    const scrollDy = dt * dir * SCROLL_STEP;
    if (scrollDy !== 0) callback(scrollDy);
  });
}
