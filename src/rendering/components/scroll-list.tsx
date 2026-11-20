import { Box, type DOMElement, useBoxMetrics } from 'ink';
import { type RefObject, useRef, useState } from 'react';
import { useScroll } from '../hooks/use-scroll';
import { MessageList } from './messages/message-list';
import { WelcomingText } from './welcome-text';

export function ScrollList({
  containerRef,
}: {
  containerRef: RefObject<DOMElement | null>;
}) {
  const contentRef = useRef<DOMElement>(null);

  const containerMetrics = useBoxMetrics(containerRef);
  const contentMetrics = useBoxMetrics(contentRef);

  const [scrollTop, setScrollTop] = useState<number>(0);

  useScroll(dy => {
    // `scrollTop` is a positive content offset: 0 at the top, growing to
    // `maxScroll` (content taller than the viewport) as you scroll down.
    const maxScroll = Math.max(
      0,
      contentMetrics.clientHeight - containerMetrics.clientHeight
    );

    setScrollTop(prev => Math.min(maxScroll, Math.max(prev + dy, 0)));
  });
  return (
    <Box
      ref={contentRef}
      contentOffsetY={scrollTop}
      flexDirection="column"
      alignItems="flex-start"
      flexShrink={0}
    >
      <WelcomingText />
      <MessageList />
    </Box>
  );
}
