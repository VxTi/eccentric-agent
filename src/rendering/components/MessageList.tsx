import { useEffect, useRef, useState, type JSX } from 'react';
import { Box, measureElement, type DOMElement } from 'ink';
import { useAgent }             from '../context';
import { useMessageState }      from '../context';
import { ModelMessageFragment } from './model-message-fragment';

export function MessageList(): JSX.Element {
  const [scrollOffset, setScrollOffset] = useState<number>(0);

  const { messages } = useAgent();

  const viewportRef = useRef<DOMElement | null>(null);
  const contentRef = useRef<DOMElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (viewportRef.current) {
      const { height } = measureElement(viewportRef.current);
      if (height !== viewportHeight) setViewportHeight(height);
    }
    if (contentRef.current) {
      const { height } = measureElement(contentRef.current);
      if (height !== contentHeight) setContentHeight(height);
    }
  }, [viewportHeight, contentHeight]);

  const overflow = Math.max(0, contentHeight - viewportHeight);
  const clampedOffset = Math.min(Math.max(0, scrollOffset), overflow);

  useEffect(() => {
    if (clampedOffset !== scrollOffset) {
      setScrollOffset(clampedOffset);
    }
  }, [clampedOffset, scrollOffset]);

  const marginTop = -(overflow - clampedOffset);

  return (
    <Box ref={viewportRef} flexDirection="column" flexGrow={1} flexShrink={1} overflowY="hidden">
      <Box ref={contentRef} flexDirection="column" flexShrink={0} marginTop={marginTop}>
        {messages.map((message, idx) => (
          <Box key={idx} flexShrink={0} flexDirection="column">
            <ModelMessageFragment message={message} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
