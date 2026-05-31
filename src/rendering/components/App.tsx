import { type ReactNode, useEffect } from 'react';
import { Box, Text } from 'ink';
import {
  emitEvent,
  EventName,
  subscribeEvent,
  unsubscribeEvent,
} from '../../lib/events/events';
import { useAgent } from '../context';
import { useTerminalSize } from '../hooks';
import { MessageList } from './MessageList';
import { StatusLine } from './StatusLine';
import InputField from './user-input/input-field';

export function App(): ReactNode {
  const { width, height } = useTerminalSize();

  const context = useAgent();

  useEffect(() => {
    const handleContextRetrieval = () => {
      emitEvent(EventName.CONTEXT_SYNC_RESULT, context);
    };

    subscribeEvent(EventName.CONTEXT_SYNC_REQUEST, handleContextRetrieval);

    return () => {
      unsubscribeEvent(EventName.CONTEXT_SYNC_REQUEST, handleContextRetrieval);
    };
  }, [context]);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderColor="redBright"
      borderStyle="round"
    >
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
      </Box>
    </Box>
  );
}
