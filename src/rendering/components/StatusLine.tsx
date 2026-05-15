import { useEffect, useState, type JSX } from 'react';
import { Box, Text } from 'ink';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

interface StatusLineProps {
  status: string;
}

export function StatusLine({ status }: StatusLineProps): JSX.Element {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <Box width="80%" alignSelf="center">
      <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>
      <Text> {status}</Text>
    </Box>
  );
}
