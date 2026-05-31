import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import {
  type AssistantMessage,
  type GenericMessage,
  type Message,
  type UserMessage,
} from '../../lib/types/messages';
import { MarkdownLines, MarkdownView } from './MarkdownView';

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
    <Box flexDirection="row" flexShrink={0} flexWrap="wrap">
      <Text>Me</Text>
      <Text color="gray"> ▶ </Text>
      <MarkdownView content={message.content} />
    </Box>
  );
}

function Assistant({ message }: { message: AssistantMessage }) {
  return (
    <Box flexDirection="row" flexShrink={0} flexWrap="wrap">
      <Text color="blue">◆ </Text>
      <MarkdownView content={message.content} />
    </Box>
  );
}

function Generic({ message }: { message: GenericMessage }) {
  return (
    <Box maxWidth="80%" flexShrink={0} flexDirection="row" flexWrap="wrap">
      {message.failure ? (
        <Text color="red" bold>
          ✖{' '}
        </Text>
      ) : (
        <LoadingSpinner loading={message.loading} />
      )}
      <MarkdownLines text={message.content} />
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
