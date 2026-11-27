import { Box, Text, useWindowSize } from 'ink';
import { Fragment, useMemo } from 'react';
import { renderMessageBlocks } from '../../terminal-markdown-renderer/markdown-renderer';
import type { MessagePart } from '../../../lib/types/messages';
import { CollapsibleDiff } from './collapsible-diff';

// Columns the parsed markdown may assume: MessageList horizontal padding (2)
// plus the marker column every message row reserves for its bullet/prefix (2).
// Diff grids are laid out against this width, so under-reserving would make
// their rows overflow and re-wrap mid-cell.
const PARSE_WIDTH_RESERVE = 4;

interface MarkdownViewProps {
  content: string;
  parts?: MessagePart[];
  uid: string;
}

export function ChatMessageContent({ content, parts, uid }: MarkdownViewProps) {
  const { columns } = useWindowSize();
  const width = columns - PARSE_WIDTH_RESERVE;
  const blocks = useMemo(
    () => renderMessageBlocks(content, parts, width),
    [content, parts, width]
  );

  // Render as a column of one <Text> per line. Each <Text> is its own row, so
  // lines are single-spaced. A trailing '\n' inside a <Text> here (especially
  // within the parent's wrapping row layout) produces extra blank lines, which
  // is what made tables and multi-line content double-space.
  return (
    <Box flexDirection="column" flexShrink={1}>
      {blocks.map((block, index) => (
        <Fragment key={`${uid}-${index}`}>
          {index > 0 && <Text> </Text>}
          {block.kind === 'diff' ? (
            <CollapsibleDiff part={block.part} width={width} />
          ) : (
            block.lines.map((line, lineIndex) => (
              <Text key={`${uid}-${index}-${lineIndex}`} wrap="wrap">
                {line}
              </Text>
            ))
          )}
        </Fragment>
      ))}
    </Box>
  );
}
