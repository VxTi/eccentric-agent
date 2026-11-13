import { Box, Text } from 'ink';
import type { AssistantMessage } from '../../../lib/types/messages';
import { ChatMessageContent } from './chat-message-content';
import { type BaseProps } from './common';

export function AssistantChatMessage({
  message,
  maxLines,
}: BaseProps<AssistantMessage>) {
  return (
    <Box flexDirection="row" flexShrink={0} flexWrap="wrap">
      <Text color="blue">◆ </Text>
      <ChatMessageContent content={message.content} maxLines={maxLines} />
    </Box>
  );
}
