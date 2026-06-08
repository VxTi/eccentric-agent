import { useStdout } from 'ink';
import { useEffect, useState } from 'react';

export interface TerminalDimensions {
  width: number;
  height: number;
}

export function useTerminalSize(): TerminalDimensions {
  const { stdout } = useStdout();
  const [size, setSize] = useState(() => ({
    width: stdout.columns,
    height: stdout.rows,
  }));

  useEffect(() => {
    const handler = (): void => {
      setSize({
        width: stdout.columns,
        height: stdout.rows,
      });
    };
    stdout.on('resize', handler);
    return () => {
      stdout.off('resize', handler);
    };
  }, [size.width, stdout]);

  return size;
}
