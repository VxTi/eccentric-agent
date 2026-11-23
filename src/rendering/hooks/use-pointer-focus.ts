import type { Nullable } from '@vxti/typed';
import { type DOMElement, measureElement } from 'ink';
import { type RefObject, useState } from 'react';
import { useMouse } from './use-mouse';

export function usePointerFocus(
  ref: RefObject<Nullable<DOMElement>>,
  callback?: (hasFocus: boolean) => any
): boolean {
  const [focussed, setFocussed] = useState(false);
  useMouse(event => {
    if (event.kind !== 'move' || !ref.current) return;

    const { x, y } = event;
    const updatedFocussed = isWithinBounds(x, y, measureElement(ref.current));

    if (updatedFocussed !== focussed) {
      callback?.(updatedFocussed);
      setFocussed(updatedFocussed);
    }
  });

  return focussed;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function isWithinBounds(x: number, y: number, bounds: Bounds): boolean {
  return (
    x >= bounds.x &&
    x < bounds.x + bounds.width &&
    y >= bounds.y &&
    y < bounds.y + bounds.height
  );
}
