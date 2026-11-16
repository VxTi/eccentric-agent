import { isEmptyString, isNotNil } from '@vxti/typed';
import { Box, Text } from 'ink';
import { parseMarkdown } from '../../terminal-markdown-renderer/markdown-renderer';

interface MarkdownViewProps {
  content: string;
  /**
   * When set, only the last `maxLines` lines are rendered (tail-follow), with a
   * marker indicating earlier lines are hidden. Used to bound the height of the
   * message that is still streaming so it never overflows the viewport while it
   * lives in Ink's non-erasable dynamic region.
   */
  maxLines?: number;
}

export function ChatMessageContent({ content, maxLines }: MarkdownViewProps) {
  const parsedContent = parseMarkdown(content.trim()).trim();
  if (isEmptyString(parsedContent)) {
    return;
  }
  const allLines: string[] = parsedContent.split('\n').map(line => {
    const trimmed = line.trim();
    return trimmed.length === 0 ? ' ' : trimmed;
  });

  // `maxLines` is set only while the message is still streaming, where its
  // height must stay within the viewport (it lives in Ink's non-erasable
  // dynamic region — see MessageList). In that mode each visible line is capped
  // to a single terminal row (`wrap="truncate"`) so `maxLines` is an exact row
  // bound: with `wrap="wrap"` a long line would span several rows, overflow the
  // viewport, and leave un-erasable duplicate copies in the scrollback. The
  // completed message, rendered with no `maxLines`, shows every line in full.
  const streaming = isNotNil(maxLines);

  // Reserve one row for the "earlier lines" marker so marker + visible lines
  // together never exceed `maxLines` rows.
  const visibleLineBudget = streaming
    ? Math.max(1, maxLines - 1)
    : allLines.length;
  const isTruncated = streaming && allLines.length > visibleLineBudget;
  const lines = isTruncated
    ? allLines.slice(allLines.length - visibleLineBudget)
    : allLines;

  // Render as a column of one <Text> per line. Each <Text> is its own row, so
  // lines are single-spaced. A trailing '\n' inside a <Text> here (especially
  // within the parent's wrapping row layout) produces extra blank lines, which
  // is what made tables and multi-line content double-space.
  return (
    <Box flexDirection="column" flexShrink={1}>
      {isTruncated && (
        <Text dimColor wrap="truncate">
          {'↑ earlier lines shown in full when the response completes'}
        </Text>
      )}
      {lines.map((line, i) => (
        <Text key={i} wrap={streaming ? 'truncate' : 'wrap'}>
          {line}
        </Text>
      ))}
    </Box>
  );
}
