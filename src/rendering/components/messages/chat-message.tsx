import { Box } from 'ink';
import { type Message } from '../../../lib/types/messages';
import { AssistantChatMessage } from './assistant-chat-message';
import { type BaseProps } from './common';
import { GenericChatMessage } from './generic-chat-message';
import { UserChatMessage } from './user-chat-message';

export function ChatMessage({ message, maxLines }: BaseProps<Message>) {
  return (
    <Box
      alignSelf="flex-start"
      width="100%"
      justifyContent="flex-start"
      flexShrink={0}
      paddingBottom={1}
    >
      <ModelMessageText message={message} maxLines={maxLines} />
    </Box>
  );
}

function ModelMessageText({ message, maxLines }: BaseProps<Message>) {
  switch (message.type) {
    case 'user':
      return <UserChatMessage message={message} maxLines={maxLines} />;
    case 'assistant':
      return <AssistantChatMessage message={message} maxLines={maxLines} />;
    case 'generic':
      return <GenericChatMessage message={message} maxLines={maxLines} />;
  }
}
