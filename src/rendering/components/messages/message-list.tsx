import { type JSX } from 'react';
import { Box, Static, Text, useStdout } from 'ink';
import { useAgent } from '../../context';
import { type Message } from '../../../lib/types/messages';
import { ChatMessage } from './chat-message';
import { MemoizedChatMessage } from './memoized-chat-message';

type StaticItem = { kind: 'header' } | { kind: 'message'; message: Message };

// Rows reserved below the streaming message for the status line, git line,
// input field and model bar, plus the message's own role prefix and padding.
// The streaming message is capped to the remaining rows so the dynamic region
// never exceeds the viewport (see the comment in MessageList).
const RESERVED_ROWS = 10;
const MIN_STREAM_LINES = 3;
const DEFAULT_ROWS = 24;

export function MessageList(): JSX.Element {
  const { messages, status } = useAgent();
  const { stdout } = useStdout();

  // Final messages are handed to <Static>, which writes each item to the
  // terminal exactly once and never redraws it. Only the message that is still
  // being streamed can change (assistant text is updated in place by id — see
  // state/agent.ts `setMessage`), so it is the only one that must stay in the
  // dynamic, erase-and-redraw region. Everything else — including a just-
  // finished response — is flushed to Static the moment the agent is idle.
  //
  // This matters because the redraw region cannot be erased once it grows
  // taller than the terminal: Ink can't move the cursor above the top of the
  // viewport to clear lines that have scrolled into the scrollback buffer, so
  // every subsequent re-render leaves a full duplicate copy behind. Keeping a
  // long completed message out of that region is what prevents the duplication.
  //
  // `status.loading` is true for the whole in-flight turn, so the list handed
  // to Static only ever grows (it never reclaims the streaming message and then
  // re-adds it), which is required for Static's append-only rendering.
  const isStreaming = status.loading && messages.length > 0;
  const finalized = isStreaming ? messages.slice(0, -1) : messages;
  const last = isStreaming ? messages[messages.length - 1] : undefined;

  const staticItems: StaticItem[] = [
    { kind: 'header' },
    ...finalized.map(message => ({ kind: 'message', message }) as const),
  ];

  // <Static> renders at full terminal width, outside the centered 80% column
  // the rest of the UI uses, so mirror that column here to keep finalized
  // messages aligned with the streaming one and the input field.
  const size = stdout as { columns?: number; rows?: number } | undefined;
  const columns = size?.columns ?? 80;
  const rows = size?.rows ?? DEFAULT_ROWS;
  const contentWidth = Math.floor(columns * 0.8);
  const marginLeft = Math.floor(columns * 0.1);

  // Cap the streaming message so the dynamic (non-erasable) region stays within
  // the viewport. Logical lines can still wrap, so this is a conservative bound
  // rather than an exact row count — enough to prevent the runaway duplication
  // that occurs when the redraw region is taller than the terminal.
  const streamMaxLines = Math.max(MIN_STREAM_LINES, rows - RESERVED_ROWS);

  return (
    <>
      <Static items={staticItems}>
        {item => (
          <Box
            key={item.kind === 'header' ? 'header' : item.message.id}
            paddingLeft={marginLeft}
            width={columns}
          >
            {item.kind === 'header' ? (
              <WelcomingText width={contentWidth} />
            ) : (
              <Box
                width={contentWidth}
                flexDirection="column"
                alignItems="flex-start"
              >
                <MemoizedChatMessage message={item.message} />
              </Box>
            )}
          </Box>
        )}
      </Static>
      {last && (
        <Box
          flexDirection="column"
          alignItems="flex-start"
          overflow="visible"
          flexShrink={0}
        >
          <ChatMessage message={last} maxLines={streamMaxLines} />
        </Box>
      )}
    </>
  );
}

function WelcomingText({ width }: { width: number }): JSX.Element {
  return (
    <Box width={width} flexDirection="column" alignItems="center">
      <Box paddingTop={1} paddingBottom={8}>
        <Text color="blue">◆</Text>
        <Text bold> Eccentric Agent</Text>
      </Box>
    </Box>
  );
}
