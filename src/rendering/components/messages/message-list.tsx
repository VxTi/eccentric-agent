import { useEffect, useRef, useState, type JSX, useLayoutEffect } from 'react';
import { Box, measureElement, type DOMElement } from 'ink';
import { useAgent } from '../../context';
import { useUserInputField } from '../../context/user-input-context';
import { useScroll } from '../../hooks/scroll';
import { useTerminalSize } from '../../hooks/terminal-size';
import { MemoizedChatMessage } from './memoized-chat-message';

export function MessageList(): JSX.Element {
  const { messages } = useAgent();
  const { inputRequest } = useUserInputField();
  const { height: terminalHeight } = useTerminalSize();

  const containerRef = useRef<DOMElement | null>(null);
  const contentListRef = useRef<DOMElement | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const [scrollOffset, setScrollOffset] = useState(0);

  const overflow = Math.max(0, contentHeight - containerHeight);
  const clampedOffset = Math.min(Math.max(0, scrollOffset), overflow);

  useLayoutEffect(() => {
    if (containerRef.current) {
      const { height } = measureElement(containerRef.current);
      setContainerHeight(height);
    }
    if (contentListRef.current) {
      const { height } = measureElement(contentListRef.current);
      setContentHeight(height);
    }
  }, [messages, inputRequest, terminalHeight]);

  useEffect(() => {
    if (clampedOffset !== scrollOffset) setScrollOffset(clampedOffset);
  }, [clampedOffset, scrollOffset, terminalHeight]);

  useScroll(dy => setScrollOffset(prev => prev + dy));

  return (
    <Box
      ref={containerRef}
      flexDirection="column"
      alignItems="flex-start"
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
      height={containerHeight}
      overflow="hidden"
    >
      <Box
        ref={contentListRef}
        flexDirection="column"
        flexShrink={0}
        marginTop={-(overflow - clampedOffset)}
      >
        {messages.map((message, idx) => (
          <MemoizedChatMessage
            key={idx}
            message={message}
            containerHeight={containerHeight}
            scrollOffset={scrollOffset}
          />
        ))}
      </Box>
    </Box>
  );
}
