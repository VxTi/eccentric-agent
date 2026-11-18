import type { ReactNode } from 'react';
import { Box } from 'ink';
import { useAgent } from '../../context';
import { ChatMessage } from './chat-message';

// NOTE: ink supports only a single <Static> instance in the whole app, and the
// welcome banner already uses it. Rendering finalized messages in a second
// <Static> here silently prevented them (and anything after them) from being
// drawn — which is why tool/command output emitted via `emitMessage` never
// appeared. Messages are therefore rendered dynamically; the banner keeps the
// sole <Static>.
export function MessageList(): ReactNode {
  const { messages } = useAgent();

  return (
    <Box width="100%" flexDirection="column" alignItems="center">
      <Box flexDirection="column" alignItems="flex-start" flexShrink={0}>
        {messages.map(message => (
          <ChatMessage key={message.id} message={message} />
        ))}
      </Box>
    </Box>
  );
}
