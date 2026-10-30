import { Box, Text } from 'ink';
import { type ReactNode } from 'react';
import { useAgent } from '../context';
import { useTerminalSize } from '../hooks/terminal-size';
import { GitInfoLine } from './git-info-line';
import { LoadingStatusLine } from './loading-status-line';
import { MessageList } from './messages/message-list';
import { ModelInfoBar } from './model-info-bar';
import InputField from './user-input/input-field';

export function App(): ReactNode {
  const { width } = useTerminalSize();

  const boxWidth: string = width <= 100 ? '100%' : width <= 120 ? '80%' : '60%';

  return (
    <Box
      flexDirection="column"
      width={width}
      borderColor="#333333"
      borderStyle="round"
      alignItems="center"
    >
      <Box width={boxWidth} flexGrow={1} flexDirection="column">
        <WelcomingText />
        <Box
          height="100%"
          width="100%"
          alignItems="flex-start"
          flexDirection="column"
        >
          <MessageList />
          <LoadingStatusLine />
          <GitInfoLine />
          <InputField />
          <ModelInfoBar />
        </Box>
      </Box>
    </Box>
  );
}

function WelcomingText() {
  const { messages } = useAgent();
  if (messages.length > 0) return;

  return (
    <Box flexDirection="column" alignItems="center">
      <Box paddingY={1}>
        <Text color="blue">◆</Text>
        <Text bold> Eccentric Agent</Text>
      </Box>
    </Box>
  );
}
