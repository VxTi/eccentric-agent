import { hasArrayLengthAtLeast, isNonEmptyArray } from '@vxti/typed';
import { type ReactNode } from 'react';
import { Box, Static } from 'ink';
import { type Message } from '../../../lib/types/messages';
import { useAgent } from '../../context';
import { ChatMessage } from './chat-message';

export function MessageList(): ReactNode {
  const { messages } = useAgent();

  const chunked = chunkMessages(messages);

  return (
    <Box width="100%" flexDirection="column" alignItems="center">
      <Box flexDirection="column" alignItems="flex-start" flexShrink={0}>
        {chunked.map((chunk, i) =>
          chunk.immutable ? (
            <Static items={chunk.messages} key={i}>
              {message => <ChatMessage key={message.id} message={message} />}
            </Static>
          ) : (
            chunk.messages.map(message => (
              <ChatMessage key={message.id} message={message} />
            ))
          )
        )}
      </Box>
    </Box>
  );
}

function chunkMessages(
  list: Message[]
): { messages: Message[]; immutable: boolean }[] {
  if (!isNonEmptyArray(list)) return [];

  const batches: { messages: Message[]; immutable: boolean }[] = [];

  list.forEach(message => {
    const immutable = message.immutable ?? false;
    if (!hasArrayLengthAtLeast(batches, 1) || immutable !== batches[0]) {
      batches.push({
        immutable,
        messages: [message],
      });
    } else {
      batches[batches.length - 1]?.messages.push(message);
    }
  });
  return batches;
}
