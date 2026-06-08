import { Box } from 'ink';
import { type Message } from '../../../lib/types/messages';
import { AssistantChatMessage } from './assistant-chat-message';
import { type BaseProps } from './common';
import { GenericChatMessage } from './generic-chat-message';
import { UserChatMessage } from './user-chat-message';

export function ChatMessage({ message }: BaseProps<Message>) {
  return (
    <Box
      alignSelf="flex-start"
      width="100%"
      justifyContent="flex-start"
      flexShrink={0}
      paddingBottom={1}
    >
      <ModelMessageText message={message} />
    </Box>
  );
}

function ModelMessageText(props: BaseProps<Message>) {
  switch (props.message.type) {
    case 'user':
      return <UserChatMessage message={props.message} />;
    case 'assistant':
      return <AssistantChatMessage message={props.message} />;
    case 'generic':
      return <GenericChatMessage message={props.message} />;
  }
}
