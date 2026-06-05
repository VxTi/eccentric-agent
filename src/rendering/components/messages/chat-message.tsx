import { Box } from 'ink';
import { type Message } from '../../../lib/types/messages';
import { AssistantChatMessage } from './assistant-message';
import { GenericChatMessage } from './generic-message';
import { UserChatMessage } from './user-chat-message';

interface Props {
  viewportHeight: number;
  scrollOffset: number;
  message: Message;
}

export function ChatMessage({ message, viewportHeight, scrollOffset }: Props) {
  return (
    <Box
      alignSelf="flex-start"
      width="100%"
      justifyContent="flex-start"
      flexShrink={0}
      marginBottom={1}
    >
      <ModelMessageText
        message={message}
        viewportHeight={viewportHeight}
        scrollOffset={scrollOffset}
      />
    </Box>
  );
}

function ModelMessageText(props: Props) {
  switch (props.message.type) {
    case 'user':
      return <UserChatMessage {...props} message={props.message} />;
    case 'assistant':
      return <AssistantChatMessage {...props} message={props.message} />;
    case 'generic':
      return <GenericChatMessage {...props} message={props.message} />;
  }
}
