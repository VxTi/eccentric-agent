import { Box, type DOMElement, useWindowSize } from 'ink';
import { type ReactNode, useRef } from 'react';
import { GitInfoLine } from './git-info-line';
import { BottomInfoBar } from './bottom-info-bar';
import { ScrollList } from './scroll-list';
import InputField from './user-input/input-field';

export function App(): ReactNode {
  const scrollAreaRef = useRef<DOMElement>(null);
  const { rows, columns } = useWindowSize();
  return (
    <Box
      flexDirection="column"
      height={rows}
      width={columns}
      alignItems="center"
    >
      <Box
        flexGrow={1}
        flexDirection="column"
        width="100%"
        ref={scrollAreaRef}
        overflow="hidden"
      >
        <ScrollList containerRef={scrollAreaRef} />
      </Box>
      <Box
        flexDirection="column"
        width="100%"
        alignItems="center"
        flexShrink={0}
      >
        <GitInfoLine />
        <InputField />
        <BottomInfoBar />
      </Box>
    </Box>
  );
}
