import { useEffect, useRef, useState, type JSX } from 'react';
import { Box, measureElement, useInput, type DOMElement } from 'ink';
import { useAgent } from '../context';
import { useUserInputField } from '../context/user-input-context';
import { ModelMessageFragment } from './model-message-fragment';

const SCROLL_STEP = 1;

// SGR wheel report: CSI < BTN ; X ; Y (M|m), with the leading ESC stripped by
// Ink. Wheel-up button is 64, wheel-down is 65.
const WHEEL_INPUT_PATTERN = /^\[?<(\d+);\d+;\d+[Mm]$/;
const WHEEL_UP_ANSI_CODE = 64;
const WHEEL_DOWN_ANSI_CODE = 65;

export function MessageList(): JSX.Element {
  const { messages } = useAgent();
  const { inputRequest } = useUserInputField();

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
  }, [messages, contentHeight, inputRequest, viewportHeight]);

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
    <Box ref={viewportRef} flexDirection="column" flexGrow={1} flexShrink={1}>
      <Box
        ref={contentRef}
        flexDirection="column"
        flexShrink={0}
        overflowY="hidden"
        top={-(overflow - clampedOffset)}
      >
        <ModelMessageFragment
          message={{
            type: 'generic',
            id: '123',
            content: `
\`\`\`typescript
import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import {
  type AssistantMessage,
  type GenericMessage,
  type Message,
  type UserMessage,
} from '../../lib/types/messages';
import { MarkdownView } from './MarkdownView';

export function ModelMessageFragment({ message }: { message: Message }) {
  return (
    <Box
      width="80%"
      alignSelf="center"
      justifyContent="flex-start"
      flexShrink={0}
      marginBottom={1}
    >
      <ModelMessageText message={message} />
    </Box>
  );
}

function ModelMessageText({ message }: { message: Message }) {
  switch (message.type) {
    case 'user':
      return <User message={message} />;
    case 'assistant':
      return <Assistant message={message} />;
    case 'generic':
      return <Generic message={message} />;
  }
}

function User({ message }: { message: UserMessage }) {
  return (
    <Box flexDirection="row" flexShrink={0} flexWrap="wrap">
      <Text>Me</Text>
      <Text color="gray"> ▶ </Text>
      <MarkdownView content={message.content} />
    </Box>
  );
}

function Assistant({ message }: { message: AssistantMessage }) {
  return (
    <Box flexDirection="row" flexShrink={0} flexWrap="wrap">
      <Text color="blue">◆ </Text>
      <MarkdownView content={message.content} />
    </Box>
  );
}

function Generic({ message }: { message: GenericMessage }) {
  return (
    <Box maxWidth="80%" flexShrink={0} flexDirection="row" flexWrap="wrap">
      {message.failure ? (
        <Text color="red" bold>
          ✖{' '}
        </Text>
      ) : (
        <LoadingSpinner loading={message.loading} />
      )}
      <MarkdownView content={message.content} />
    </Box>
  );
}

function LoadingSpinner({ loading }: { loading?: boolean | undefined }) {
  const [content, setContent] = useState('◎');

  useEffect(() => {
    const frames = ['◉', '◎'];

    let frame = 0;

    setInterval(() => {
      setContent(frames[++frame % frames.length]);
    }, frames.length * 200);
  }, []);

  if (!loading) return;

  return <Text>{content} </Text>;
}

\`\`\`
      `,
          }}
        />
        {messages.map((message, idx) => (
          <Box key={idx} flexShrink={0} flexDirection="column">
            <ModelMessageFragment message={message} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
