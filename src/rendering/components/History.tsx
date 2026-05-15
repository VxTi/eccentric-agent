import { useSyncExternalStore, type JSX } from 'react';
import { Box } from 'ink';
import type { RendererStore } from '../renderer-store';
import { Fragment } from './fragments/Fragment';

interface HistoryProps {
  store: RendererStore;
}

export function History({ store }: HistoryProps): JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getState);

  const total = state.fragments.length;
  const clampedOffset = Math.min(state.offset, Math.max(0, total - 1));
  const sliceEnd = total - clampedOffset;
  const visible = state.fragments.slice(0, sliceEnd);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      overflow="hidden"
      justifyContent="flex-end"
    >
      {visible.map((fragment, idx) => (
        <Fragment key={idx} fragment={fragment} />
      ))}
    </Box>
  );
}
