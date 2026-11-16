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
  // terminal exactly once and never redraws it. A message may therefore only be
  // finalized once it can no longer change: assistant text is updated in place
  // by id while it streams, and a tool message (`state/agent.ts setMessage`)
  // flips from `loading: true` to `loading: false` when the tool resolves. A
  // message committed to Static while still loading would keep its spinner
  // forever, because the later resolution updates state but never repaints the
  // frozen row. Since the model can emit several tool calls in one step (each
  // appended while a previous one is still in flight), the dynamic region must
  // hold every message from the first unresolved one onward — not just the last.
  //
  // The dynamic (erase-and-redraw) region must also stay short: it cannot be
  // erased once it grows taller than the terminal, as Ink can't move the cursor
  // above the top of the viewport, so each re-render would leave a duplicate
  // copy behind. In practice the still-loading messages are one-line tool
  // statuses and only the single trailing message (streaming assistant text)
  // can be long, so the region stays bounded.
  //
  // `finalized` is the longest stable prefix: everything before the first
  // still-loading message, and, while streaming, never the last message. The
  // prefix only ever grows, which is what Static's append-only rendering needs.
  const dynamicStart = computeDynamicStart(messages, status.loading);
  const finalized = messages.slice(0, dynamicStart);
  const dynamic = messages.slice(dynamicStart);

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
      {dynamic.length > 0 && (
        <Box
          flexDirection="column"
          alignItems="flex-start"
          overflow="visible"
          flexShrink={0}
        >
          {dynamic.map(message => (
            <ChatMessage
              key={message.id}
              message={message}
              maxLines={streamMaxLines}
            />
          ))}
        </Box>
      )}
    </>
  );
}

// The stable prefix ends at the first message that can still change: the
// earliest still-loading tool message, or — while a turn is in flight — the
// last message (which may be streaming assistant text). Everything from there
// to the end stays in the dynamic, redrawable region so its spinner and content
// keep updating; everything before it is safe to freeze into <Static>.
function computeDynamicStart(messages: Message[], loading: boolean): number {
  if (!loading || messages.length === 0) return messages.length;
  const lastIndex = messages.length - 1;
  const firstLoading = messages.findIndex(
    message => message.type === 'generic' && message.loading === true
  );
  return firstLoading === -1 ? lastIndex : Math.min(firstLoading, lastIndex);
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
