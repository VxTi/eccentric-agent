import { Box, Text } from 'ink';
import type { AssistantMessage } from '../../../lib/types/messages';
import { Markdown } from '../markdown';

interface Props {
  viewportHeight: number;
  scrollOffset: number;
  message: AssistantMessage;
}
export function AssistantChatMessage({ message, ...props }: Props) {
  return (
    <Box flexDirection="row" flexShrink={0} flexWrap="wrap">
      <Text color="blue">◆ </Text>
      <Markdown content={message.content} {...props} />
    </Box>
  );
}
