import { Box, Text } from 'ink';
import { marked } from 'marked';
import { type JSX } from 'react';

interface MarkdownViewProps {
  content: string;
}

export function ChatMessageContent({
  content,
}: MarkdownViewProps): JSX.Element {
  const lines: string[] = marked
    .parse(content.trim(), { async: false, gfm: true })
    .split('\n');

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
