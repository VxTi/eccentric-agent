import type { AssistantMessage } from '../../../lib/types/messages';
import type { BaseProps } from './common';
import { Box, Text } from 'ink';
import { ChatMessageContent } from './chat-message-content';

export function AssistantChatMessage({ message }: BaseProps<AssistantMessage>) {
  return (
    <Box flexDirection="row" flexShrink={0}>
      <Text color="blue">◆ </Text>
      <ChatMessageContent content={message.content} uid={message.id} />
    </Box>
  );
}
