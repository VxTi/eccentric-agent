import { useEffect, useRef, useState, type JSX } from 'react';
import { Box, measureElement, useInput, type DOMElement } from 'ink';
import { useAgent } from '../context';
import { ModelMessageFragment } from './model-message-fragment';

const SCROLL_STEP = 1;

// SGR wheel report: CSI < BTN ; X ; Y (M|m), with the leading ESC stripped by
// Ink. Wheel-up button is 64, wheel-down is 65.
const WHEEL_INPUT_PATTERN = /^\[?<(\d+);\d+;\d+[Mm]$/;
const WHEEL_UP_ANSI_CODE = 64;
const WHEEL_DOWN_ANSI_CODE = 65;

export function MessageList(): JSX.Element {
  const { messages } = useAgent();

  const viewportRef = useRef<DOMElement | null>(null);
  const contentRef = useRef<DOMElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    if (viewportRef.current) {
      const { height } = measureElement(viewportRef.current);
      if (height !== viewportHeight) setViewportHeight(height);
    }
    if (contentRef.current) {
      const { height } = measureElement(contentRef.current);
      if (height !== contentHeight) setContentHeight(height);
    }
  }, [messages, viewportHeight, contentHeight]);

  const overflow = Math.max(0, contentHeight - viewportHeight);
  const clampedOffset = Math.min(Math.max(0, scrollOffset), overflow);

  useEffect(() => {
    if (clampedOffset !== scrollOffset) setScrollOffset(clampedOffset);
  }, [clampedOffset, scrollOffset]);

  // Wheel up reveals older messages (larger offset); wheel down reveals newer.
  useInput(input => {
    const button = Number(WHEEL_INPUT_PATTERN.exec(input)?.[1]);

    if (button === WHEEL_UP_ANSI_CODE)
      setScrollOffset(prev => prev + SCROLL_STEP);
    else if (button === WHEEL_DOWN_ANSI_CODE)
      setScrollOffset(prev => prev - SCROLL_STEP);
  });

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
        marginTop={-(overflow - clampedOffset)}
      >
        {messages.map((message, idx) => (
          <Box key={idx} flexShrink={0} flexDirection="column">
            <ModelMessageFragment message={message} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
