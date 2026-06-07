import { Box, Text } from 'ink';
import { type JSX } from 'react';
import { parseMarkdown } from '../../terminal-markdown-renderer/markdown-renderer';

interface MarkdownViewProps {
  content: string;
}

export function ChatMessageContent({
  content,
}: MarkdownViewProps): JSX.Element {
  const lines: string[] = parseMarkdown(content.trim())
    .trim()
    .split('\n')
    .map(line => line.trim() || ' ');

  return (
    <Box flexDirection="column" width="100%" paddingRight={1}>
      {lines.map((line, i) => (
        <Text key={i} wrap="wrap">
          {line}
        </Text>
      ))}
    </Box>
  );
}
