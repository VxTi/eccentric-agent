import { isEmptyString, isNonEmptyArray, isNotNil } from '@vxti/typed';
import { type JSX, type ReactNode, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { CURSOR_BLINK_INTERVAL_MS } from '../../../lib/constants';
import { CHANNEL_ID_NONE } from '../../../lib/events/user-input';
import { useUserInputField } from '../../hooks/use-user-input';
import { Suggestions } from './input-suggestions';
import { InputRequest } from './user-input-request-dialog';

const INPUT_PLACEHOLDER = 'Reference files with @, and type commands using / ↵';

export default function InputField(): JSX.Element {
  const { inputRequest } = useUserInputField();

  if (
    isNonEmptyArray(inputRequest?.request.options) &&
    inputRequest.request.channelId !== CHANNEL_ID_NONE
  ) {
    return <InputRequest request={inputRequest.request} />;
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
      <Suggestions />
    </Box>
  );
}

function InputText(): ReactNode {
  const {
    input: { value, cursorOffset },
  } = useUserInputField();
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
