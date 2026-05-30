import type { ModelMessage } from 'ai';
import { Box, Text } from 'ink';
import { formatMarkdown } from '../formatting';

export function ModelMessageFragment({ message }: { message: ModelMessage }) {
  if (typeof message.content !== 'string') {
    return null;
  }

  return (
    <Box
      width="80%"
      alignSelf="center"
      justifyContent="flex-start"
      flexShrink={0}
      marginBottom={1}
    >
      <ModelMessageText message={message} />
    </Box>
  );
}

function ModelMessageText({ message }: { message: ModelMessage }) {
  if (typeof message.content !== 'string') return;

  switch (message.role) {
    case 'user':
      return (
        <Box>
          <Text>Me</Text>
          <Text color="gray"> ▶ </Text>
          <Text>{formatMarkdown(message.content)}</Text>
        </Box>
      );
    case 'assistant':
      return (
        <Box>
          <Text color="blue">◆ </Text>
          <Text>{formatMarkdown(message.content)}</Text>
        </Box>
      );
    case 'tool':
      return (
        <Box maxWidth="80%">
          <Text>{message.content}</Text>
        </Box>
      );
    default:
      return undefined; // TODO: Handle other cases
  }
}
