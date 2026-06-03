import { Box, Text } from 'ink';
import type { AssistantMessage } from '../../../lib/types/messages';
import { MarkdownView } from '../MarkdownView';

interface Props {
  viewportHeight: number;
  scrollOffset: number;
  message: AssistantMessage;
}
export function AssistantChatMessage({ message, ...props }: Props) {
  return (
    <Box flexDirection="row" flexShrink={0} flexWrap="wrap">
      <Text color="blue">◆ </Text>
      <MarkdownView content={message.content} {...props} />
    </Box>
  );
}
