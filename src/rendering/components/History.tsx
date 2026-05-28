import { useEffect, useRef, useState, type JSX } from 'react';
import { Box, measureElement, type DOMElement } from 'ink';
import { useMessageState, useMessageStore } from '../message-context';
import { Fragment } from './fragments/Fragment';

export function History(): JSX.Element {
  const { offset, fragments } = useMessageState();
  const store = useMessageStore();
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
  });

  const overflow = Math.max(0, contentHeight - viewportHeight);
  const clampedOffset = Math.min(Math.max(0, offset), overflow);

  useEffect(() => {
    if (clampedOffset !== offset) store.setOffset(clampedOffset);
  }, [clampedOffset, offset, store]);

  const marginTop = -(overflow - clampedOffset);

  return (
    <Box
      ref={viewportRef}
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      overflowY="hidden"
    >
      <Box
        ref={contentRef}
        flexDirection="column"
        flexShrink={0}
        marginTop={marginTop}
      >
        {fragments.map((fragment, idx) => (
          <Box key={idx} flexShrink={0} flexDirection="column">
            <Fragment fragment={fragment} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
