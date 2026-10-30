import { Box, Text } from 'ink';
import { type ReactNode } from 'react';
import { useAgent } from '../context';
import { GitInfoLine } from './git-info-line';
import { LoadingStatusLine } from './loading-status-line';
import { MessageList } from './messages/message-list';
import { ModelInfoBar } from './model-info-bar';
import InputField from './user-input/input-field';

export function App(): ReactNode {
  return (
    <Box flexDirection="column" width="100%" alignItems="center">
      <Box width="80%" flexGrow={1} flexDirection="column">
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
