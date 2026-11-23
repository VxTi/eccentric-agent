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

/**
 * Subscribes to wheel events and reports velocity-smoothed scroll deltas.
 *
 * Each wheel event produces a `scrollDy` whose magnitude scales with the time since the
 * previous event (fast scrolling yields larger deltas), normalized against a 70 ms interval
 * and capped so that pauses longer than 70 ms still count as a single step.
 *
 * @param callback - Invoked for each wheel event with the computed {@link ScrollEvent}.
 * @param deps - Extra dependencies; when they change, the callback is resubscribed.
 */
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
