import { Text, useAnimation } from 'ink';

const frames: string[] = ['⁘', '∷', '⁘', '∵'];

export function Spinner({ loading }: { loading?: boolean }) {
  const { frame } = useAnimation({ interval: 250, isActive: loading });

  if (!loading) return;

  return <Text>{frames[frame % frames.length]} </Text>;
}
