import { useStdout } from 'ink';
import { useEffect, useState } from 'react';

export interface TerminalDimensions {
  width: number;
  height: number;
}

export function useTerminalSize(): TerminalDimensions {
  const { stdout } = useStdout();
  const [size, setSize] = useState(() => ({
    width: stdout.columns ?? 80,
    height: stdout.rows ?? 24,
  }));

  useEffect(() => {
    const handler = (): void => {
      setSize({
        width: stdout.columns ?? 80,
        height: stdout.rows ?? 24,
      });
    };
    stdout.on('resize', handler);
    return () => {
      stdout.off('resize', handler);
    };
  }, [stdout]);

  return size;
}
