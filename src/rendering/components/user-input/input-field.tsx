import { isEmptyString, isNonEmptyArray } from '@vxti/typed';
import { type JSX, type ReactNode, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { CURSOR_BLINK_INTERVAL_MS } from '../../../lib/constants';
import { CHANNEL_ID_NONE } from '../../../lib/events/user-input';
import { useUserInputField } from '../../context';
import { Suggestions } from './input-suggestions';
import { InputRequest } from './option-request';

const INPUT_PLACEHOLDER = 'Reference files with @, and type commands using /';

export default function InputField(): JSX.Element {
  const { inputRequest } = useUserInputField();

  if (
    isNonEmptyArray(inputRequest.options) &&
    inputRequest.channelId !== CHANNEL_ID_NONE
  ) {
    return <InputRequest />;
  }

  return (
    <Box
      width="100%"
      alignSelf="center"
      flexDirection="column"
      flexShrink={0}
      paddingTop={1}
      overflow="hidden"
    >
      <Suggestions />
      <Box
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        flexDirection="column"
      >
        <InputText />
      </Box>
    </Box>
  );
}

function InputText(): ReactNode {
  const { input, cursorOffset } = useUserInputField();
  const safeCursor = Math.max(0, Math.min(cursorOffset, input.length));

  const [blinkState, setBlinkState] = useState<boolean>(false);

  useEffect(() => {
    const id = setInterval(
      () => setBlinkState(prev => !prev),
      CURSOR_BLINK_INTERVAL_MS
    );
    return () => clearInterval(id);
  }, []);

  if (isEmptyString(input)) {
    return (
      <Box flexDirection="row">
        <Text inverse={blinkState}> </Text>
        <Text color="gray" italic wrap="wrap">
          {' '}
          {INPUT_PLACEHOLDER}
        </Text>
      </Box>
    );
  }

  const characters = input.split('');

  return (
    <Box flexDirection="row" flexWrap="wrap" flexShrink={1}>
      {characters.map((char, index) => (
        <Text key={index} inverse={blinkState && index === safeCursor}>
          {char}
        </Text>
      ))}
      {safeCursor === input.length && blinkState && (
        <Text inverse={true}> </Text>
      )}
    </Box>
  );
}

export function formatReferencedFiles(input: string): string {
  const re = /@(\S+)/g;
  let match: RegExpExecArray | null;
  let sanitized = input;
  while ((match = re.exec(input)) !== null) {
    const path = match[1].replace(/[.,;:!?)\]]+$/, '');
    sanitized = sanitized.replace(match[0], `\`${path}\``);
  }
  return sanitized;
}
