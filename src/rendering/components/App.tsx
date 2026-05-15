import { useEffect, useState, useSyncExternalStore, type JSX } from 'react';
import { Box, useStdout } from 'ink';
import type { AgentContext } from '../../common/agent-context';
import type { RendererStore } from '../renderer-store';
import { History } from './History';
import { StatusLine } from './StatusLine';
import { InputController } from './InputController';

interface AppProps {
  store: RendererStore;
  context: AgentContext;
}

function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState(() => ({
    columns: stdout.columns ?? 80,
    rows: stdout.rows ?? 24,
  }));

  useEffect(() => {
    const handler = (): void => {
      setSize({
        columns: stdout.columns ?? 80,
        rows: stdout.rows ?? 24,
      });
    };
    stdout.on('resize', handler);
    return () => {
      stdout.off('resize', handler);
    };
  }, [stdout]);

  return size;
}

export function App({ store, context }: AppProps): JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const { columns, rows } = useTerminalSize();

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <History store={store} />
      {state.status !== null && <StatusLine status={state.status} />}
      <InputController context={context} />
    </Box>
  );
}
