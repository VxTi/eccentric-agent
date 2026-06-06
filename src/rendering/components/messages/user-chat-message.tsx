import { Box, Text } from 'ink';
import type { UserMessage }   from '../../../lib/types/messages';
import { ChatMessageContent } from './chat-message-content';
import { type CommonProps }   from './common';

export function UserChatMessage({
  message,
  ...props
}: CommonProps<UserMessage>) {
  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      padding={1}
      backgroundColor="#333333"
      borderLeft
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderLeftColor="red"
      borderStyle="single"
      flexWrap="wrap"
    >
      <Text>Me</Text>
      <Text color="#777777"> ▶ </Text>
      <ChatMessageContent content={message.content} {...props} />
    </Box>
  );
}
