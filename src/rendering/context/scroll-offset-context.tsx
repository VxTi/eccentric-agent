import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
} from 'react';

/**
 * The scroll container's current `contentOffsetY`, handed over as a ref so
 * hit-testing consumers can read it at event time without re-rendering on
 * every scroll tick. Layout coordinates from `measureElement` exclude the
 * offset; viewport coordinates from mouse events include it.
 */
const ScrollOffsetContext = createContext<RefObject<number> | undefined>(
  undefined
);

export function ScrollOffsetProvider({
  offset,
  children,
}: {
  offset: RefObject<number>;
  children: ReactNode;
}): ReactNode {
  return (
    <ScrollOffsetContext.Provider value={offset}>
      {children}
    </ScrollOffsetContext.Provider>
  );
}

export function useScrollOffset(): RefObject<number> {
  const offset = useContext(ScrollOffsetContext);
  if (!offset) {
    throw new Error('useScrollOffset requires a ScrollOffsetProvider');
  }
  return offset;
}
