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
    input: { value, cursorOffset },
  } = useInputArea();
  const safeCursor = Math.max(0, Math.min(cursorOffset, value.length));

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

  const characters = value.split('');

  return (
    <Box flexDirection="row" flexWrap="wrap" flexShrink={1}>
      <CursorPrefix />
      {characters.map((char, index) => (
        <Text key={index} inverse={blinkState && index === safeCursor}>
          {char}
        </Text>
      ))}
      {safeCursor === value.length && <Text inverse={blinkState}> </Text>}
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
