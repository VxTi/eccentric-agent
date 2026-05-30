import { type JSX, type ReactNode, useEffect, useState } from 'react';
import { Box, Text, useInput, usePaste } from 'ink';
import { CURSOR_BLINK_INTERVAL_MS } from '../../../lib/constants';
import {
  EventName,
  subscribeEvent,
  unsubscribeEvent,
  type UserInputRequestEvent,
} from '../../../lib/events';
import { useAbort, useAgent } from '../../context';
import { useUserInputField } from '../../context/user-input-field';
import { useTerminalSize } from '../../hooks';
import { Suggestions } from './input-suggestions';
import { InputRequest } from './option-request';

const INPUT_PLACEHOLDER = 'Reference files with @, and type commands using /';
const MIN_SUGGESTION_COUNT = 8;

export default function InputField(): JSX.Element {
  const { height } = useTerminalSize();
  const maxSuggestions = Math.ceil(
    Math.max(height / 2.5, MIN_SUGGESTION_COUNT)
  );

  const {
    input,
    setInput,
    setCursorOffset,
    cursorOffset,
    setSuggestions,
    suggestionCursorIndex,
    suggestions,
    suggestionIndex,
    setSuggestionIndex,
    inputRequest,
    setInputRequest,
  } = useUserInputField();

  const controller = useAbort();
  const agent = useAgent();

  useEffect(() => {
    setSuggestionIndex(0);
  }, [setSuggestionIndex, suggestions]);

  useEffect(() => {
    const handleInputRequest = (event: UserInputRequestEvent) =>
      setInputRequest(event.detail);

    subscribeEvent(EventName.REQUEST_USER_INPUT, handleInputRequest);

    return () => {
      unsubscribeEvent(EventName.REQUEST_USER_INPUT, handleInputRequest);
    };
  }, [setInputRequest]);

  const submitMessage = () => {
    agent.submitMessage(formatReferencedFiles(input));
    setInput('');
    setCursorOffset(0);
  };

  usePaste(text => {
    const updatedText = input + text;
    setInput(updatedText);
    setCursorOffset(cursorOffset + text.length);
  });

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'c') {
      controller.abort(0);
    }

    // Handled in another component
    if (inputRequest.options.length > 0) return;

    // Suggestion handling
    if (suggestions.length > 0) {
      if (key.upArrow) {
        setSuggestionIndex(
          prev => (prev + suggestions.length - 1) % suggestions.length
        );
        return;
      }

      if (key.downArrow) {
        setSuggestionIndex(
          prev => (prev + suggestions.length + 1) % suggestions.length
        );
        return;
      }

      if (key.escape) {
        setSuggestionIndex(-1);
        return;
      }

      if (key.tab || key.return) {
        setInput(
          prev =>
            `${
              prev.slice(0, suggestionCursorIndex) +
              suggestions[suggestionIndex]
            } ${prev.slice(cursorOffset)}`
        );
        setCursorOffset(
          suggestionCursorIndex + suggestions[suggestionIndex].length + 1
        );
        setSuggestions([]);
        return;
      }
    }

    if (key.return) {
      submitMessage();
      return;
    }

    if (key.backspace || key.delete) {
      if (cursorOffset === 0) return;

      setInput(
        prev => prev.slice(0, cursorOffset - 1) + prev.slice(cursorOffset)
      );
      setCursorOffset(prev => prev - 1);
      return;
    }

    if (key.leftArrow) {
      if (cursorOffset === 0) return;
      setCursorOffset(prev => prev - 1);
      return;
    }

    if (key.rightArrow) {
      if (cursorOffset >= input.length) return;

      setCursorOffset(prev => prev + 1);
      return;
    }

    if (
      inputChar &&
      !key.ctrl &&
      !key.meta &&
      inputChar.length === 1 &&
      inputChar >= ' '
    ) {
      setInput(
        prev =>
          prev.slice(0, cursorOffset) + inputChar + prev.slice(cursorOffset)
      );
      setCursorOffset(prev => prev + 1);
      return;
    }
  });

  if (inputRequest.options.length > 0) {
    return <InputRequest />;
  }

  return (
    <Box
      width="80%"
      alignSelf="center"
      flexDirection="column"
      flexShrink={0}
      paddingTop={1}
    >
      <Suggestions maxSuggestions={maxSuggestions} />
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
  const before = input.slice(0, safeCursor);
  const cursorChar = input[safeCursor] ?? ' ';
  const after = input.slice(safeCursor + 1);

  const [blinkState, setBlinkState] = useState<boolean>(false);

  useEffect(() => {
    const id = setInterval(
      () => setBlinkState(prev => !prev),
      CURSOR_BLINK_INTERVAL_MS
    );
    return () => clearInterval(id);
  }, []);

  if (input.length === 0) {
    return (
      <Box>
        <Text inverse={blinkState}>{cursorChar}</Text>
        <Text color="gray" italic>
          {' '}
          {INPUT_PLACEHOLDER}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexWrap="wrap">
      <Text>{before}</Text>
      <Text inverse={blinkState}>{cursorChar}</Text>
      <Text>{after}</Text>
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
