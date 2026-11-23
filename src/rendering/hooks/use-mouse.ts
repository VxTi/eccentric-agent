import { type DependencyList, useEffect } from 'react';
import { type MouseEvent, mouseEventEmitter } from '../../lib/mouse-input';

export type MouseListener = (event: MouseEvent) => void;

export function useMouse(listener: MouseListener, deps?: DependencyList) {
  useEffect(() => {
    mouseEventEmitter.on('mouse', listener);
    return () => {
      mouseEventEmitter.off('mouse', listener);
    };
  }, [listener, deps]);
}
