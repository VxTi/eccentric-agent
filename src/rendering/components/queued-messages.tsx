import type { ReactNode } from 'react';
import { Text } from 'ink';
import { useAgent } from '../hooks';

export function QueuedMessages(): ReactNode {
  const { queuedMessageCount } = useAgent();
  if (queuedMessageCount === 0) return;

  const label =
    queuedMessageCount === 1
      ? '1 message queued'
      : `${queuedMessageCount} messages queued`;

  return (
    <Text color="yellow" italic>
      {label}
    </Text>
  );
}
