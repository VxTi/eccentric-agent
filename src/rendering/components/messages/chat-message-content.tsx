import { isEmptyString } from '@vxti/typed';
import { Box, Text } from 'ink';
import { useMemo } from 'react';
import { parseMarkdown } from '../../terminal-markdown-renderer/markdown-renderer';

interface MarkdownViewProps {
  content: string;
  uid: string;
}

export function ChatMessageContent({ content, uid }: MarkdownViewProps) {
  const parsedContent = useMemo(() => parseMarkdown(content).trim(), [content]);

  if (isEmptyString(parsedContent)) {
    return;
  }
  const allLines: string[] = parsedContent.split('\n').map(line => {
    const trimmed = line.trim();
    return trimmed.length === 0 ? ' ' : trimmed;
  });

  // Render as a column of one <Text> per line. Each <Text> is its own row, so
  // lines are single-spaced. A trailing '\n' inside a <Text> here (especially
  // within the parent's wrapping row layout) produces extra blank lines, which
  // is what made tables and multi-line content double-space.
  return (
    <Box flexDirection="column" flexShrink={1}>
      {allLines.map((line, i) => (
        <Text key={`${uid}-${i}`} wrap="wrap">
          {line}
        </Text>
      ))}
    </Box>
  );
}
