import { Box, Text } from 'ink';
import { type JSX } from 'react';
import { parseMarkdown } from '../../markdown-options';

interface MarkdownViewProps {
  content: string;
}

export function ChatMessageContent({
  content,
}: MarkdownViewProps): JSX.Element {
  const lines: string[] = parseMarkdown(content).split('\n');

  return (
    <Box flexDirection="column" width="100%" paddingRight={1}>
      {lines.map((line, i) => (
        <Text key={i} wrap="wrap">
          {!line.length ? ' ' : line}
        </Text>
      ))}
    </Box>
  );
}
