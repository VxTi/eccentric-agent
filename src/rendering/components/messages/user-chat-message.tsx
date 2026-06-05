import { Box, Text } from 'ink';
import type { UserMessage } from '../../../lib/types/messages';
import { Markdown } from '../markdown';

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
      <Markdown content={message.content} {...props} />
    </Box>
  );
}
