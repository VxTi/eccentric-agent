import { type DependencyList, useEffect } from 'react';
import { type MouseEvent, mouseEventEmitter } from '../../lib/mouse-input';

export type MouseListener = (event: MouseEvent) => void;

/**
 * Subscribes the given listener to global mouse events for the lifetime of the component.
 *
 * @param listener - Invoked with each {@link MouseEvent} emitted by the mouse input source.
 * @param deps - Extra dependencies; when they change, the listener is resubscribed.
 */
export function useMouse(listener: MouseListener, deps?: DependencyList) {
  useEffect(() => {
    mouseEventEmitter.on('mouse', listener);
    return () => {
      mouseEventEmitter.off('mouse', listener);
    };
  }, [listener, deps]);
}
