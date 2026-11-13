import { Box, Text } from 'ink';
import type { UserMessage } from '../../../lib/types/messages';
import { ChatMessageContent } from './chat-message-content';
import { type BaseProps } from './common';

export function UserChatMessage({ message }: BaseProps<UserMessage>) {
  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      marginBottom={1}
      paddingLeft={1}
      paddingRight={1}
      backgroundColor="#222222"
      borderLeft
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderLeftColor="red"
      borderStyle="single"
      flexWrap="wrap"
      width="100%"
    >
      <Text>Me</Text>
      <Text color="#777777"> ▶ </Text>
      <ChatMessageContent content={message.content} />
    </Box>
  );
}
