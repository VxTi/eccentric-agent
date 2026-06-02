import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import {
  type AssistantMessage,
  type GenericMessage,
  type Message,
  type UserMessage,
} from '../../lib/types/messages';
import { MarkdownView } from './MarkdownView';

interface Props<T extends Message = Message> {
  viewportHeight: number;
  scrollOffset: number;
  message: T;
}

export function ModelMessageFragment({
  message,
  viewportHeight,
  scrollOffset,
}: Props) {
  return (
    <Box
      width="80%"
      alignSelf="center"
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
      return <User {...props} message={props.message} />;
    case 'assistant':
      return <Assistant {...props} message={props.message} />;
    case 'generic':
      return <Generic {...props} message={props.message} />;
  }
}

function User({ message, ...props }: Props<UserMessage>) {
  return (
    <Box flexDirection="row" flexShrink={0} flexWrap="wrap">
      <Text>Me</Text>
      <Text color="gray"> ▶ </Text>
      <MarkdownView content={message.content} {...props} />
    </Box>
  );
}

function Assistant({ message, ...props }: Props<AssistantMessage>) {
  return (
    <Box flexDirection="row" flexShrink={0} flexWrap="wrap">
      <Text color="blue">◆ </Text>
      <MarkdownView content={message.content} {...props} />
    </Box>
  );
}

function Generic({ message, ...props }: Props<GenericMessage>) {
  return (
    <Box maxWidth="80%" flexShrink={0} flexDirection="row">
      {message.failure ? (
        <Text color="red" bold>
          ✖{' '}
        </Text>
      ) : (
        <LoadingSpinner loading={message.loading} />
      )}
      <MarkdownView content={message.content} {...props} />
    </Box>
  );
}

function LoadingSpinner({ loading }: { loading?: boolean | undefined }) {
  const [content, setContent] = useState('◎');

  useEffect(() => {
    const frames = ['◉', '◎'];

    let frame = 0;

    setInterval(() => {
      setContent(frames[++frame % frames.length]);
    }, frames.length * 200);
  }, []);

  if (!loading) return;

  return <Text>{content} </Text>;
}
