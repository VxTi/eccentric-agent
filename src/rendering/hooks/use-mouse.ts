import type { MouseEvent } from '../../lib/mouse-input';
import { type DependencyList, useEffect } from 'react';
import { useMouseContext } from './use-mouse-context';

export type MouseListener = (event: MouseEvent) => void;

/**
 * Subscribes the given listener to global mouse events for the lifetime of the component.
 *
 * @param listener - Invoked with each {@link MouseEvent} emitted by the mouse input source.
 * @param deps - Extra dependencies; when they change, the listener is resubscribed.
 */
export function useMouse(listener: MouseListener, deps?: DependencyList) {
  const { mouse } = useMouseContext();

  useEffect(() => mouse.subscribe(listener), [listener, deps, mouse]);
}
