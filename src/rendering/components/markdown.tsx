import { Box, Text } from 'ink';
import { marked } from 'marked';
import { type JSX } from 'react';

interface MarkdownViewProps {
  content: string;
}

export function Markdown({ content }: MarkdownViewProps): JSX.Element {
  // Intentionally not memoized, it causes lag-lag
  return (
    <Box flexDirection="column" width="100%">
      {marked
        .parse(content, { async: false, gfm: true })
        .split('\n')
        .map((line, i) => (
          <Text key={i}>{!line.length ? ' ' : line}</Text>
        ))}
    </Box>
  );
}
