import { useEffect, useState, type ReactNode } from 'react';
import { Box, useStdout } from 'ink';
import { useMessageState } from '../message-context';
import { AgentEngine } from './AgentEngine';
import { History } from './History';
import { StatusLine } from './StatusLine';
import { InputController } from './InputController';

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

export function App(): ReactNode {
  const state = useMessageState();
  const { columns, rows } = useTerminalSize();

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <AgentEngine />
      <History />
      {state.status !== null && <StatusLine status={state.status} />}
      <InputController />
    </Box>
  );
}
