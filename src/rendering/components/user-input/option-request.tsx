import { Box, Text, useInput } from 'ink';
import { type ReactNode, useState } from 'react';
import { emitEvent, UserInputResponseEvent } from '../../../lib/events';
import { useUserInputField } from '../../context/user-input-field';

export function InputRequest(): ReactNode {
  const { inputRequest, setInputRequest } = useUserInputField();
  const [userSelectedInputIndex, setUserSelectedInputIndex] =
    useState<number>(0);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  useInput((char, key) => {
    if (!inputRequest) return; // Shouldn't happen

    if (char === ' ') {
      setActiveIndex(current =>
        current === userSelectedInputIndex ? -1 : userSelectedInputIndex
      );
      return;
    }

    if (key.upArrow) {
      setUserSelectedInputIndex(
        prev =>
          (prev + inputRequest.options.length - 1) % inputRequest.options.length
      );
    } else if (key.downArrow) {
      setUserSelectedInputIndex(
        prev =>
          (prev + inputRequest.options.length + 1) % inputRequest.options.length
      );
    } else if (key.return || key.tab) {
      emitEvent(
        new UserInputResponseEvent(inputRequest.options[userSelectedInputIndex])
      );

      setInputRequest(undefined);
      setUserSelectedInputIndex(-1);
    }
  });
  if (!inputRequest) return; // Shouldn't happen

  return (
    <Box width="80%" alignSelf="center" flexDirection="column">
      <Box flexDirection="column" alignItems="center">
        <Text bold color="white">
          {inputRequest.title}
        </Text>
        <Text color="gray">{inputRequest.description}</Text>
      </Box>
      <Box marginTop={1} marginLeft={2} flexDirection="column">
        <Text italic color="gray">
          Press space to select an option, or
        </Text>
        {inputRequest.options.map((option, i) => (
          <Box>
            <Text color={i === activeIndex ? 'redBright' : 'white'}>
              {i === activeIndex ? '◉' : '◯'}
            </Text>
            <Text
              key={i}
              color={i === userSelectedInputIndex ? 'red' : 'white'}
            >
              {' '}
              {option.label}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
