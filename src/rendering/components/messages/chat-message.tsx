import { Box } from 'ink';
import { type Message } from '../../../lib/types/messages';
import { AssistantChatMessage } from './assistant-chat-message';
import { type CommonProps } from './common';
import { GenericChatMessage } from './generic-chat-message';
import { UserChatMessage } from './user-chat-message';

export function ChatMessage({
  message,
  containerHeight,
  scrollOffset,
}: CommonProps<Message>) {
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
        containerHeight={containerHeight}
        scrollOffset={scrollOffset}
      />
    </Box>
  );
}

function ModelMessageText(props: CommonProps<Message>) {
  switch (props.message.type) {
    case 'user':
      return <UserChatMessage {...props} message={props.message} />;
    case 'assistant':
      return <AssistantChatMessage {...props} message={props.message} />;
    case 'generic':
      return <GenericChatMessage {...props} message={props.message} />;
  }
}
