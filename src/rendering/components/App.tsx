import { type ReactNode, useEffect } from 'react';
import { Box, Text } from 'ink';
import {
  AgentContextSyncResult,
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
      emitEvent(new AgentContextSyncResult(context));
    };

    subscribeEvent(EventName.SYNC_AGENT_CONTEXT, handleContextRetrieval);

    return () => {
      unsubscribeEvent(EventName.SYNC_AGENT_CONTEXT, handleContextRetrieval);
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
