import { Box, Text } from 'ink';
import { type Message } from '../context';
import { formatMarkdown } from '../formatting';

export function ModelMessageFragment({ message }: { message: Message }) {
  if (typeof message.content !== 'string') {
    return null;
  }

  return (
    <Box width="80%" alignSelf="center" justifyContent="flex-start" flexShrink={0}>
      <Text>{formatMarkdown(message.content)}</Text>
    </Box>
  );
}
