import { isEmptyString, isNotNil } from '@vxti/typed';
import { Text } from 'ink';
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

  return (
    <>
      {isTruncated && (
        <Text key="truncation" dimColor wrap="truncate">
          {'↑ earlier lines shown in full when the response completes'}
          {'\n'}
        </Text>
      )}
      {lines.map((line, i) => (
        <Text key={i} wrap="wrap">
          {line}
          {'\n'}
        </Text>
      ))}
    </>
  );
}
