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

  const isTruncated = isNotNil(maxLines) && allLines.length > maxLines;
  const lines = isTruncated
    ? allLines.slice(allLines.length - maxLines)
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
        <Text key={i} wrap="wrap">
          {line}
        </Text>
      ))}
    </Box>
  );
}
