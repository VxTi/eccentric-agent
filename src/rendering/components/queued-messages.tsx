import { Box, Text } from 'ink';
import { type ReactNode } from 'react';
import { useAgent } from '../hooks/use-agent';

export function QueuedMessages(): ReactNode {
  const { queuedMessageCount } = useAgent();
  if (queuedMessageCount === 0) return null;

  const label =
    queuedMessageCount === 1
      ? '1 message queued'
      : `${queuedMessageCount} messages queued`;

  return (
    <Box width="100%">
      <Text color="gray">{label}</Text>
    </Box>
  );
}
