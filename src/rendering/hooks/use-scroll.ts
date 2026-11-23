import { type DependencyList, useEffect, useRef } from 'react';
import {
  mouseEventEmitter,
  type WheelDirection,
  type WheelEvent,
} from '../../lib/mouse-input';

const SCROLL_STEP = 1;

export interface ScrollEvent {
  direction: WheelDirection;
  mouseX: number;
  mouseY: number;
  scrollDy: number;
}

export type WheelListener = (event: WheelEvent) => void;
export type ScrollCallback = (params: ScrollEvent) => void;

export function useScroll(callback: ScrollCallback, deps?: DependencyList) {
  const lastScrollTimeMs = useRef<number>(-1);

  useEffect(() => {
    const listener: WheelListener = ({ direction, x, y }) => {
      const dt =
        lastScrollTimeMs.current === -1
          ? 0
          : 70 / Math.max(40, Date.now() - lastScrollTimeMs.current);

      lastScrollTimeMs.current = Date.now();
      callback({
        direction,
        mouseX: x,
        mouseY: y,
        scrollDy: -direction * SCROLL_STEP * dt,
      });
    };

    mouseEventEmitter.on('wheel', listener);
    return () => {
      mouseEventEmitter.off('wheel', listener);
    };
  }, [callback, deps]);
}
