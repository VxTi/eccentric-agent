import { type ReactNode } from 'react';
import { Box, Text } from 'ink';
import { useAgent } from '../context';
import { useTerminalSize } from '../hooks';
import { MessageList } from './MessageList';
import { StatusLine } from './StatusLine';
import InputField from './user-input/input-field';

export function App(): ReactNode {
  const { width, height } = useTerminalSize();

  return (
    <Box flexDirection="column" width={width} height={height} borderColor="red" borderStyle="round">
      <WelcomingText />
      <MessageList />
      <StatusLine />
      <InputField />
    </Box>
  );
}

function WelcomingText() {
  const { messages } = useAgent();
  if (messages.length > 0) return;

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
