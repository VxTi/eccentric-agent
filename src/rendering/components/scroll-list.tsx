import { Box, type DOMElement, useBoxMetrics } from 'ink';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { ScrollAcceleration, usePointerFocus, useScroll } from '../hooks';
import { ScrollOffsetProvider } from '../context/scroll-offset-context';
import { MessageList } from './messages/message-list';
import { WelcomingText } from './welcome-text';

export function ScrollList({
  containerRef,
}: {
  containerRef: RefObject<DOMElement | null>;
}) {
  const contentRef = useRef<DOMElement>(null);
  const scrollOffsetRef = useRef(0);

  const containerMetrics = useBoxMetrics(containerRef);
  const contentMetrics = useBoxMetrics(contentRef);

  const [scrollTop, setScrollTop] = useState<number>(0);
  // Whether the view is pinned to the bottom. True until the user scrolls
  // away from the bottom, so streaming content keeps the newest messages
  // in view without fighting manual scrolling.
  const isPinnedToBottom = useRef<boolean>(true);

  const maxScroll = Math.max(
    0,
    contentMetrics.clientHeight - containerMetrics.clientHeight
  );

  // Wheel events are only meaningful while the pointer sits inside the scroll
  // area; everywhere else they belong to other hit-tested views.
  const isPointerInScrollArea = usePointerFocus(containerRef);

  useScroll(
    ({ scrollDy }) => {
      if (!isPointerInScrollArea) return;

      setScrollTop(prev => {
        const next = Math.min(maxScroll, Math.max(prev + scrollDy, 0));
        isPinnedToBottom.current = next >= maxScroll;
        return next;
      });
    },
    [isPointerInScrollArea],
    { scrollAccelerator: ScrollAcceleration.accelerated }
  );

  // Follow the content while pinned to the bottom (e.g. as the agent streams
  // a response); when unpinned, only clamp against the content shrinking.
  useEffect(() => {
    setScrollTop(prev =>
      isPinnedToBottom.current ? maxScroll : Math.min(prev, maxScroll)
    );
  }, [maxScroll]);

  useEffect(() => {
    scrollOffsetRef.current = scrollTop;
  }, [scrollTop]);

  return (
    <ScrollOffsetProvider offset={scrollOffsetRef}>
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
    </ScrollOffsetProvider>
  );
}
