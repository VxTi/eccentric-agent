import { type ReactNode, useEffect } from 'react';
import { Box, Text } from 'ink';
import { emitEvent, EventName, eventOn } from '../../lib/events/events';
import { useAgent } from '../context';
import { useTerminalSize } from '../hooks/terminal-size';
import { GitInfoLine } from './git-info-line';
import { ModelInfoBar } from './model-info-bar';
import { MessageList } from './messages/message-list';
import { LoadingStatusLine } from './loading-status-line';
import InputField from './user-input/input-field';

export function App(): ReactNode {
  const { width, height } = useTerminalSize();

  const context = useAgent();

  useEffect(() => {
    return eventOn(EventName.CONTEXT_SYNC_REQUEST, () => {
      emitEvent(EventName.CONTEXT_SYNC_RESULT, context);
    });
  }, [context]);

  const boxWidth = width <= 100 ? '100%' : width <= 120 ? '80%' : '60%';

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
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
