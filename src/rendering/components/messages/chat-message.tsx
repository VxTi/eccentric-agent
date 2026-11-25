import type { BaseProps } from './common';
import { isEmptyString } from '@vxti/typed';
import { Box } from 'ink';
import { type Message, MessageType } from '../../../lib/types/messages';
import { AssistantChatMessage } from './assistant-chat-message';
import { DelegatedTaskChatMessage } from './delegated-task-chat-message';
import { GenericChatMessage } from './generic-chat-message';
import { ThoughtChatMessage } from './thought-chat-message';
import { UserChatMessage } from './user-chat-message';

export function ChatMessage({ message }: BaseProps<Message>) {
  // The delegated-task variant's `content` is an optional summary; its tasks
  // are the payload and must render even when the summary is empty.
  if (
    message.type !== MessageType.DELEGATED_TASK &&
    isEmptyString(message.content, true)
  ) {
    return null;
  }

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

function ModelMessageText({ message }: BaseProps<Message>) {
  switch (message.type) {
    case MessageType.USER:
      return <UserChatMessage message={message} />;
    case MessageType.ASSISTANT:
      return <AssistantChatMessage message={message} />;
    case MessageType.GENERIC:
      return <GenericChatMessage message={message} />;
    case MessageType.REASONING:
      return <ThoughtChatMessage message={message} />;
    case MessageType.DELEGATED_TASK:
      return <DelegatedTaskChatMessage message={message} />;
  }
}
