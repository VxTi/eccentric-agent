import { useEffect, useRef, useState, type JSX, useLayoutEffect } from 'react';
import { Box, measureElement, type DOMElement } from 'ink';
import { type Dimensions } from '../../../lib/types/types';
import { useAgent } from '../../context';
import { useUserInputField } from '../../context/user-input-context';
import { useScroll } from '../../hooks/scroll';
import { useTerminalSize } from '../../hooks/terminal-size';
import { terminalRenderer } from '../../terminal-markdown-renderer/markdown-renderer';
import { MemoizedChatMessage } from './memoized-chat-message';

export function MessageList(): JSX.Element {
  const { messages } = useAgent();
  const { inputRequest } = useUserInputField();
  const { width: terminalWidth, height: terminalHeight } = useTerminalSize();

  const containerRef = useRef<DOMElement | null>(null);
  const contentListRef = useRef<DOMElement | null>(null);

  const [containerDimensions, setContainerDimensions] = useState<Dimensions>({
    width: 0,
    height: 0,
  });
  const [contentDimensions, setContentDimensions] = useState<Dimensions>({
    width: 0,
    height: 0,
  });

  const [scrollOffset, setScrollOffset] = useState(0);

  const overflow = Math.max(
    0,
    contentDimensions.height - containerDimensions.height
  );
  const clampedOffset = Math.min(Math.max(0, scrollOffset), overflow);

  useLayoutEffect(() => {
    if (containerRef.current) {
      const { width, height } = measureElement(containerRef.current);
      setContainerDimensions({ width, height });
    }
    if (contentListRef.current) {
      const { width, height } = measureElement(contentListRef.current);
      setContentDimensions({ width, height });
    }
  }, [messages, inputRequest, terminalHeight, terminalWidth]);

  useEffect(() => {
    const edgeMargin = 4;
    terminalRenderer.setWidth(contentDimensions.width - edgeMargin);
  }, [contentDimensions.width]);

  useEffect(() => {
    if (clampedOffset !== scrollOffset) setScrollOffset(clampedOffset);
  }, [clampedOffset, scrollOffset]);

  useScroll(dy => setScrollOffset(prev => prev + dy));

  return (
    <Box
      ref={containerRef}
      flexDirection="column"
      alignItems="flex-start"
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      height={containerDimensions.height}
      overflow="hidden"
    >
      <Box
        ref={contentListRef}
        flexDirection="column"
        flexShrink={0}
        marginTop={-(overflow - clampedOffset)}
      >
        {messages.map((message, idx) => (
          <MemoizedChatMessage key={idx} message={message} />
        ))}
      </Box>
    </Box>
  );
}
