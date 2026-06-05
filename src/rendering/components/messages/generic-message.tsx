import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import { type GenericMessage } from '../../../lib/types/messages';
import { MarkdownView } from '../MarkdownView';

interface Props {
  viewportHeight: number;
  scrollOffset: number;
  message: GenericMessage;
}

export function GenericChatMessage({ message, ...props }: Props) {
  return (
    <Box flexShrink={0} flexDirection="row">
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
    const frames = ['ஃ', '⁘'];

    let frame = 0;

    setInterval(() => {
      setContent(frames[++frame % frames.length]);
    }, frames.length * 200);
  }, []);

  if (!loading) return;

  return <Text>{content} </Text>;
}
