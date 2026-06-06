import { Box, Text } from 'ink';
import { type GenericMessage } from '../../../lib/types/messages';
import { Spinner } from '../spinner';
import { ChatMessageContent } from './chat-message-content';
import { type BaseProps } from './common';

export function GenericChatMessage({ message }: BaseProps<GenericMessage>) {
  return (
    <Box flexShrink={0} flexDirection="row">
      {message.failure ? (
        <Text color="red" bold>
          ✖{' '}
        </Text>
      ) : (
        <Spinner loading={message.loading ?? false} />
      )}
      <ChatMessageContent content={message.content} />
    </Box>
  );
}
