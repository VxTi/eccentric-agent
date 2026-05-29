import { useEffect, useState, type ReactNode } from 'react';
import { Box, Text, useStdout } from 'ink';
import { useMessageState } from '../context/messages';
import { useAgentEngine } from '../hooks/agent-engine';
import { MessageList } from './MessageList';
import { StatusLine } from './StatusLine';
import UserInput from './UserInput';

function useTerminalSize(): { width: number; height: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState(() => ({
    width: stdout.columns ?? 80,
    height: stdout.rows ?? 24,
  }));

  useEffect(() => {
    const handler = (): void => {
      setSize({
        width: stdout.columns ?? 80,
        height: stdout.rows ?? 24,
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
  const { status } = useMessageState();
  const { width, height } = useTerminalSize();

  useAgentEngine();

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderColor="red"
      borderStyle="round"
    >
      <WelcomingText />
      <MessageList />
      {status !== null && <StatusLine status={status} />}
      <UserInput />
    </Box>
  );
}

function WelcomingText() {
  const { fragments } = useMessageState();
  if (fragments.length > 0) return;

  return (
    <Box flexDirection="column" alignItems="center">
      <Box marginTop={1}>
        <Text color="blue">◆</Text>
        <Text bold> Eccentric Agent</Text>
        <Text dimColor> — type @ for files, Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
}
