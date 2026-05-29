import { useEffect, useState, type ReactNode } from 'react';
import { Box, Text } from 'ink';
import { useAgent } from '../context';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

export function StatusLine(): ReactNode {
  const { loading, statusText } = useAgent();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!loading) return;

    const id = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loading]);

  if (!loading && !statusText.length) return null;

  return (
    <Box width="80%" alignSelf="center">
      {loading && <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>}
      {statusText && <Text> {statusText}</Text>}
    </Box>
  );
}
