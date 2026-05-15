import type { JSX } from 'react';
import { Box, Text } from 'ink';

export interface InputFieldState {
  text: string;
  cursor: number;
  prefix?: string;
  pickerLines?: string[];
}

interface InputBoxProps {
  state: InputFieldState;
}

function renderWithCursor(text: string, cursor: number): JSX.Element {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, safeCursor);
  const cursorChar = text[safeCursor] ?? ' ';
  const after = text.slice(safeCursor + 1);
  return (
    <Text>
      {before}
      <Text inverse>{cursorChar}</Text>
      {after}
    </Text>
  );
}

export function InputBox({ state }: InputBoxProps): JSX.Element {
  const prefix = state.prefix ?? '';
  const fullText = prefix + state.text;
  const cursorPos = prefix.length + state.cursor;
  const pickerLines = state.pickerLines ?? [];

  return (
    <Box width="80%" alignSelf="center" flexDirection="column">
      {pickerLines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      <Box
        backgroundColor="gray"
        paddingY={1}
        paddingX={1}
        flexDirection="column"
      >
        {renderWithCursor(fullText, cursorPos)}
      </Box>
    </Box>
  );
}
