import { Box, Text } from 'ink';
import type { UserMessage } from '../../../lib/types/messages';
import { MarkdownView } from '../MarkdownView';

interface Props {
  viewportHeight: number;
  scrollOffset: number;
  message: UserMessage;
}

export function UserChatMessage({ message, ...props }: Props) {
  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      padding={1}
      backgroundColor="black"
      borderLeftBackgroundColor="gray"
      flexWrap="wrap"
    >
      <Text>Me</Text>
      <Text color="gray"> ▶ </Text>
      <MarkdownView content={message.content} {...props} />
    </Box>
  );
}
