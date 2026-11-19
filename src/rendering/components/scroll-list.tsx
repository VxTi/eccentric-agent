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
  const scrollRef = useRef<number>(0);

  const containerMetrics = useBoxMetrics(containerRef);
  const contentMetrics = useBoxMetrics(contentRef);

  const [scrollTop, setScrollTop] = useState<number>(0);

  useScroll(dy => {
    const nextY = scrollRef.current + dy;

    setScrollTop(
      Math.min(
        0,
        nextY,
        -(contentMetrics.height - containerMetrics.clientHeight)
      )
    );
  });
  return (
    <Box
      ref={contentRef}
      contentOffsetY={scrollTop}
      flexDirection="column"
      alignItems="flex-start"
      flexGrow={1}
    >
      <WelcomingText />
      <MessageList />
    </Box>
  );
}
