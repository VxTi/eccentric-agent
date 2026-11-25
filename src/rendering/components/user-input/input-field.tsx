import { isEmptyString, isNotNil } from '@vxti/typed';
import { type JSX, type ReactNode, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { CURSOR_BLINK_INTERVAL_MS } from '../../../lib/constants';
import { UserInputProvider } from '../../context/user-input-context';
import { hasActiveInputRequest, useInputArea } from '../../hooks';
import { InputSuggestions } from './input-suggestions';
import { UserInputRequestDialog } from './user-input-request-dialog';

const INPUT_PLACEHOLDER = 'Reference files with @, and type commands using / ↵';

export function InputFieldContainer() {
  return (
    <UserInputProvider>
      <InputField />
    </UserInputProvider>
  );
}

export function InputField(): JSX.Element {
  const { inputRequest } = useInputArea();

  if (hasActiveInputRequest(inputRequest)) {
    return (
      <UserInputRequestDialog
        key={inputRequest.id}
        request={inputRequest.request}
      />
    );
  }

  return (
    <Box
      width="100%"
      alignSelf="center"
      flexDirection="column"
      flexShrink={0}
      overflow="hidden"
    >
      <Box borderColor="gray" borderStyle="round" flexDirection="column">
        <InputText />
      </Box>
      <InputSuggestions />
    </Box>
  );
}

function InputText(): ReactNode {
  const {
    input: { value, cursor },
  } = useInputArea();

  const [blinkState, setBlinkState] = useState<boolean>(false);

  useEffect(() => {
    const id = setInterval(
      () => setBlinkState(prev => !prev),
      CURSOR_BLINK_INTERVAL_MS
    );
    return () => clearInterval(id);
  }, []);

  if (isEmptyString(value)) {
    return (
      <Box flexDirection="row">
        <CursorPrefix />
        <Text inverse={blinkState}> </Text>
        <Text color="gray" italic wrap="wrap">
          {INPUT_PLACEHOLDER}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexShrink={1}>
      {value.split('\n').map((line, lineIndex) => (
        <InputLine
          key={lineIndex}
          content={line}
          isContinuation={lineIndex > 0}
          showCursor={blinkState && lineIndex === cursor.line}
          cursorColumn={lineIndex === cursor.line ? cursor.column : undefined}
        />
      ))}
    </Box>
  );
}

interface InputLineProps {
  content: string;
  cursorColumn: number | undefined;
  isContinuation: boolean;
  showCursor: boolean;
}

function InputLine({
  content,
  cursorColumn,
  isContinuation,
  showCursor,
}: InputLineProps) {
  const isCursorAtLineEnd =
    isNotNil(cursorColumn) && cursorColumn >= content.length;

  return (
    <Box flexDirection="row" flexWrap="wrap" flexShrink={1}>
      {isContinuation ? <Text>{'  '}</Text> : <CursorPrefix />}
      {content.split('').map((char, index) => (
        <Text key={index} inverse={showCursor && index === cursorColumn}>
          {char}
        </Text>
      ))}
      {isCursorAtLineEnd && <Text inverse={showCursor}> </Text>}
    </Box>
  );
}

function CursorPrefix() {
  return <Text>❯ </Text>;
}

export function formatReferencedFiles(input: string): string {
  const re = /@(\S+)/g;
  let match: RegExpExecArray | null;
  let sanitized = input;
  while ((match = re.exec(input)) !== null && isNotNil(match[1])) {
    const path = match[1].replace(/[.,;:!?)\]]+$/, '');
    sanitized = sanitized.replace(match[0], `\`${path}\``);
  }
  return sanitized;
}
