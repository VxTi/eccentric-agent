import { useEffect, useState, type ReactNode } from 'react';
import { Box, Text } from 'ink';
import { useAgent } from '../context';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

export function StatusLine(): ReactNode {
  const {
    status: { loading, text },
  } = useAgent();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!loading) return;

    const id = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loading]);

  if (!loading && !text.length) return null;

  return (
    <Box paddingTop={1}>
      {loading && <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>}
      {text && <Text> {text}</Text>}
    </Box>
  );
}
