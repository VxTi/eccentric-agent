import { Box, type DOMElement } from 'ink';
import { type ReactNode, useRef } from 'react';
import { GitInfoLine } from './git-info-line';
import { BottomInfoBar } from './bottom-info-bar';
import { ScrollList } from './scroll-list';
import InputField from './user-input/input-field';

export function App(): ReactNode {
  const scrollAreaRef = useRef<DOMElement>(null);
  return (
    <Box flexDirection="column" width="100%" height="100%" alignItems="center">
      <Box flexGrow={1} ref={scrollAreaRef} overflow="hidden">
        <ScrollList containerRef={scrollAreaRef} />
      </Box>
      <Box flexDirection="column" width="100%" alignItems="center">
        <GitInfoLine />
        <InputField />
        <BottomInfoBar />
      </Box>
    </Box>
  );
}
