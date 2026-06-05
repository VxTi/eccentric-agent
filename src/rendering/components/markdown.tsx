import { Box, Text } from 'ink';
import { marked } from 'marked';
import { type JSX, useMemo } from 'react';

interface MarkdownViewProps {
  content: string;
}

export function Markdown({ content }: MarkdownViewProps): JSX.Element {
  const rendered = useMemo(() => {
    return marked.parse(content, { async: false, gfm: true }).split('\n');
  }, [content]);
  return (
    <Box flexDirection="column" width="100%">
      {rendered.map((line, i) => (
        <Text key={i}>{!line.length ? ' ' : line}</Text>
      ))}
    </Box>
  );
}
