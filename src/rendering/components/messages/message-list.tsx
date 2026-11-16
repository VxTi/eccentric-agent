import { type JSX, type ReactNode } from 'react';
import { Box, Text } from 'ink';
import { useAgent } from '../../context';
import { ChatMessage } from './chat-message';

export function MessageList(): ReactNode {
  const { messages } = useAgent();

  return (
    <Box width="100%" flexDirection="column" alignItems="center">
      <WelcomingText />
      <Box flexDirection="column" alignItems="flex-start" flexShrink={0}>
        {messages.map(message => (
          <ChatMessage key={message.id} message={message} />
        ))}
      </Box>
    </Box>
  );
}

function WelcomingText(): JSX.Element {
  return (
    <Box width="80%" flexDirection="column" alignItems="center">
      <Box paddingTop={1} paddingBottom={8}>
        <Text bold>
          {'                         _        _      \n' +
            '  ___  ___ ___ ___ _ __ | |_ _ __(_) ___ \n' +
            " / _ \\/ __/ __/ _ \\ '_ \\| __| '__| |/ __|\n" +
            '|  __/ (_| (_|  __/ | | | |_| |  | | (__ \n' +
            ' \\___|\\___\\___\\___|_| |_|\\__|_|  |_|\\___|'}
        </Text>
      </Box>
    </Box>
  );
}
