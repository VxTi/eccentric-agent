import { isEmptyString } from '@vxti/typed';
import { Box, Text, useWindowSize } from 'ink';
import { useMemo } from 'react';
import { parseMarkdown } from '../../terminal-markdown-renderer/markdown-renderer';
import type { ToolMessageData } from '../../../lib/agent/tools/tool-payload';

// Columns the parsed markdown may assume: MessageList horizontal padding (2)
// plus the marker column every message row reserves for its bullet/prefix (2).
// Diff grids are laid out against this width, so under-reserving would make
// their rows overflow and re-wrap mid-cell.
const PARSE_WIDTH_RESERVE = 4;

interface MarkdownViewProps {
  content: string;
  data?: ToolMessageData;
  uid: string;
}

export function ChatMessageContent({ content, data, uid }: MarkdownViewProps) {
  const { columns } = useWindowSize();
  const parsedContent = useMemo(
    () => parseMarkdown(content, columns - PARSE_WIDTH_RESERVE, data).trim(),
    [content, columns, data]
  );

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
