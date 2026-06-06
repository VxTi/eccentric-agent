import { Box, type DOMElement, measureElement, Text } from 'ink';
import { marked } from 'marked';
import { type JSX, useEffect, useRef } from 'react';
import { type Message } from '../../../lib/types/messages';
import { type CommonProps } from './common';

interface MarkdownViewProps extends CommonProps<Message> {
  content: string;
}

export function ChatMessageContent({
  content,
  viewportHeight,
  scrollOffset,
}: MarkdownViewProps): JSX.Element {
  const containerRef = useRef<DOMElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const { height} = measureElement(containerRef.current);
  }, []);

  // Intentionally not memoized, it causes lag-lag
  return (
    <Box flexDirection="column" width="100%" ref={containerRef}>
      {marked
        .parse(content, { async: false, gfm: true })
        .split('\n')
        .map((line, i) => (
          <Text key={i}>{!line.length ? ' ' : line}</Text>
        ))}
    </Box>
  );
}
