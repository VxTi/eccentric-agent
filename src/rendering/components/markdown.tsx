import { Box, Text } from 'ink';
import { marked } from 'marked';
import { type JSX } from 'react';

interface MarkdownViewProps {
  content: string;
}

export function Markdown({ content }: MarkdownViewProps): JSX.Element {
  return (
    <Box flexDirection="column" width="100%">
      {marked
        .parse(content, { async: false })
        .split('\n')
        .map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
    </Box>
  );
}
