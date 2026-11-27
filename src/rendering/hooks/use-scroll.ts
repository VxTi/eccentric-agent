import type { WheelDirection, WheelEvent } from '../../lib/mouse-input';
import { type DependencyList, useEffect } from 'react';
import { useMouseContext } from './use-mouse-context';

export type WheelListener = (event: WheelEvent) => void;

const SCROLL_STEP = 1;

export interface ScrollEvent {
  direction: WheelDirection;
  mouseX: number;
  mouseY: number;
  scrollDy: number;
}

export type ScrollCallback = (params: ScrollEvent) => void;

type ScrollAccelerationFn = (dt: number) => number;

interface ScrollHookConfig {
  scrollAccelerator?: ScrollAccelerationFn;
}

export const ScrollAcceleration = {
  accelerated: (dt: number) => 70 / Math.max(40, dt),
  noAcceleration: (dt: number) => dt,
} as const satisfies Record<string, ScrollAccelerationFn>;

/**
 * Subscribes to wheel events and reports velocity-smoothed scroll deltas.
 *
 * Each wheel event produces a `scrollDy` whose magnitude scales with the time since the
 * previous event (fast scrolling yields larger deltas), normalized against a 70 ms interval
 * and capped so that pauses longer than 70 ms still count as a single step.
 *
 * @param callback - Invoked for each wheel event with the computed {@link ScrollEvent}.
 * @param deps - Extra dependencies; when they change, the callback is resubscribed.
 * @param config - Optional configuration
 */
export function useScroll(
  callback: ScrollCallback,
  deps?: DependencyList,
  config?: ScrollHookConfig
) {
  const { wheel } = useMouseContext();

  useEffect(() => {
    let lastScrollTimeMs = -1;

    const acceleratorFn =
      config?.scrollAccelerator ?? ScrollAcceleration.noAcceleration;
    const listener: WheelListener = ({ direction, x, y }) => {
      const now = Date.now();
      const dt = lastScrollTimeMs === -1 ? 0 : now - lastScrollTimeMs;
      lastScrollTimeMs = now;

      const scrollDy = -direction * SCROLL_STEP * acceleratorFn(dt);

      callback({
        direction,
        mouseX: x,
        mouseY: y,
        scrollDy,
      });
    };

    return wheel.subscribe(listener);
  }, [wheel, config, callback, deps]);
}
