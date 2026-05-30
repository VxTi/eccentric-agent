import { useEffect, useRef, useState, type JSX } from 'react';
import { Box, measureElement, useInput, type DOMElement } from 'ink';
import { stdin, stdout } from 'node:process';
import { useAgent } from '../context';
import { ModelMessageFragment } from './model-message-fragment';

const SCROLL_STEP = 1;

// SGR mouse tracking: button-event + any-motion + SGR encoding
const MOUSE_ENABLE = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
const MOUSE_DISABLE = '\x1b[?1006l\x1b[?1002l\x1b[?1000l';
// Matches CSI < BTN ; X ; Y (M|m) — wheel-up=64, wheel-down=65
const SGR_MOUSE_RE = /\x1b\[<(\d+);\d+;\d+[Mm]/g;

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

  // Keyboard fallback: PageUp/PageDown scroll the viewport.
  // Higher offset => content shifted down => older messages visible.
  useInput((_input, key) => {
    if (key.pageUp) setScrollOffset(prev => prev + SCROLL_STEP);
    else if (key.pageDown) setScrollOffset(prev => prev - SCROLL_STEP);
  });

  // Mouse wheel: enable SGR mouse tracking and parse wheel events from stdin.
  useEffect(() => {
    stdout.write(MOUSE_ENABLE);

    const handleData = (chunk: Buffer | string) => {
      const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      let match: RegExpExecArray | null;
      SGR_MOUSE_RE.lastIndex = 0;
      while ((match = SGR_MOUSE_RE.exec(data)) !== null) {
        const button = Number(match[1]);
        // Wheel up (64) => view older => increase offset.
        // Wheel down (65) => view newer => decrease offset.
        if (button === 64) setScrollOffset(prev => prev + SCROLL_STEP);
        else if (button === 65) setScrollOffset(prev => prev - SCROLL_STEP);
      }
    };

    stdin.on('data', handleData);
    return () => {
      stdin.off('data', handleData);
      stdout.write(MOUSE_DISABLE);
    };
  }, []);

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
        {messages.map((message, idx) => (
          <Box key={idx} flexShrink={0} flexDirection="column">
            <ModelMessageFragment message={message} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
