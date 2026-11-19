import type { ReactNode } from 'react';
import { Box } from 'ink';
import { useAgent } from '../../hooks/use-agent';
import { ChatMessage } from './chat-message';

export function MessageList(): ReactNode {
  const { messages } = useAgent();

  return (
    <Box
      width="100%"
      flexDirection="column"
      alignItems="center"
      flexGrow={1}
      paddingX={1}
      flexShrink={0}
      overflow="hidden"
    >
      {messages.map(message => (
        <ChatMessage key={message.id} message={message} />
      ))}
    </Box>
  );
}
