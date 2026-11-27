import {
  createContext,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  type MouseEvent,
  mouseEventEmitter,
  type WheelEvent,
} from '../../lib/mouse-input';
import { PubSub } from '../../lib/events/pub-sub';

export interface MouseContextInstance {
  mouse: PubSub<MouseEvent>;
  wheel: PubSub<WheelEvent>;
}

export const MouseContext = createContext<MouseContextInstance | undefined>(
  undefined
);

export function MouseProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const mouse = useRef(new PubSub<MouseEvent>()).current;
  const wheel = useRef(new PubSub<WheelEvent>()).current;

  // The only place that subscribes to the raw emitter; every hook consumer
  // hangs off the PubSub instances below instead of the emitter itself.
  useEffect(() => {
    const onMouseEvent = (event: MouseEvent): void => mouse.publish(event);
    const onWheelEvent = (event: WheelEvent): void => wheel.publish(event);

    mouseEventEmitter.on('mouse', onMouseEvent);
    mouseEventEmitter.on('wheel', onWheelEvent);
    return () => {
      mouseEventEmitter.off('mouse', onMouseEvent);
      mouseEventEmitter.off('wheel', onWheelEvent);
    };
  }, [mouse, wheel]);

  const value = useMemo(() => ({ mouse, wheel }), [mouse, wheel]);

  return (
    <MouseContext.Provider value={value}>{children}</MouseContext.Provider>
  );
}
