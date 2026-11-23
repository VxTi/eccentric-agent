import { useEffect, useRef } from 'react';
import { onWheel } from '../../lib/mouse-input';

const SCROLL_STEP = 1;

type ScrollHandlerFn = (scrollDy: number) => void;
type ScrollTargetFn = (x: number, y: number) => boolean;

export function useScroll(callback: ScrollHandlerFn, isTargeted: ScrollTargetFn) {
  const lastScrollTimeMs = useRef<number>(-1);
  useEffect(
    () =>
      onWheel((direction, x, y) => {
        if (!isTargeted(x, y)) return;

        const dt =
          lastScrollTimeMs.current === -1
            ? 0
            : 70 / Math.max(40, Date.now() - lastScrollTimeMs.current);

        lastScrollTimeMs.current = Date.now();
        callback(-direction * SCROLL_STEP * dt);
      }),
    [callback, isTargeted]
  );
}
