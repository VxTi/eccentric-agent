import { Box, Text } from 'ink';
import { type JSX } from 'react';
import Markdown from './markdown';

interface MarkdownViewProps {
  content: string;
}

export function MarkdownView({ content }: MarkdownViewProps): JSX.Element {
  return <Markdown content={content} />;
  /*const md = useMemo(() => formatMarkdown(content), [content]);

  return <MarkdownLines text={md} />;*/
}

export function MarkdownLines({ text }: { text: string }): JSX.Element {
  const lines = text.split('\n');
  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      maxWidth="100%"
      overflowX="hidden"
    >
      {lines.map((line, i) => (
        <Text wrap="wrap" key={i}>
          {line.length === 0 ? ' ' : line}
        </Text>
      ))}
    </Box>
  );
}
