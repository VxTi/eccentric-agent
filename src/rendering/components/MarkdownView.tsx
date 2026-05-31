import { Box, Text } from 'ink';
import type { JSX } from 'react';
import { formatMarkdown } from '../formatting';

interface MarkdownViewProps {
  content: string;
}

export function MarkdownView({ content }: MarkdownViewProps): JSX.Element {
  return <MarkdownLines text={formatMarkdown(content)} />;
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
        <Text wrap="truncate-end" key={i}>
          {line.length === 0 ? ' ' : line}
        </Text>
      ))}
    </Box>
  );
}
