import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import {
  type AssistantMessage,
  type GenericMessage,
  type Message,
  type UserMessage,
} from '../../lib/messages';
import { formatMarkdown } from '../formatting';

export function ModelMessageFragment({ message }: { message: Message }) {
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

function ModelMessageText({ message }: { message: Message }) {
  switch (message.type) {
    case 'user':
      return <User message={message} />;
    case 'assistant':
      return <Assistant message={message} />;
    case 'generic':
      return <Generic message={message} />;
  }
}

function User({ message }: { message: UserMessage }) {
  return (
    <Box flexDirection="column">
      <Box flexShrink={0}>
        <Text>Me</Text>
        <Text color="gray"> ▶ </Text>
        <Text>{formatMarkdown(message.content)}</Text>
      </Box>
    </Box>
  );
}

function Assistant({ message }: { message: AssistantMessage }) {
  return (
    <Box flexDirection="row" flexShrink={0}>
      <Text color="blue">◆</Text>
      <Text> {formatMarkdown(message.content)}</Text>
    </Box>
  );
}

function Generic({ message }: { message: GenericMessage }) {
  return (
    <Box maxWidth="80%" flexShrink={0}>
      {message.failure ? (
        <Text color="red" bold>
          ✖
        </Text>
      ) : (
        <LoadingSpinner loading={message.loading} />
      )}
      <Text> {message.content}</Text>
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

  return <Text>{content}</Text>;
}
