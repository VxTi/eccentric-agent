import { type JSX } from 'react';
import { Box } from 'ink';
import { useAgent } from '../../context';
import { MemoizedChatMessage } from './memoized-chat-message';

export function MessageList(): JSX.Element {
  const { messages } = useAgent();

  return (
    <Box
      flexDirection="column"
      alignItems="flex-start"
      overflow="visible"
      flexShrink={0}
    >
      {messages.map(message => (
        <MemoizedChatMessage key={message.id} message={message} />
      ))}
    </Box>
  );
}
