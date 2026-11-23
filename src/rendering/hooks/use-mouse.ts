import { type DependencyList, useEffect } from 'react';
import { type MouseListener } from '../context/mouse-context';
import { useMouseContext } from './use-mouse-context';

export type { MouseListener };

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
