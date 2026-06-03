import {
  type JSX,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Box, Text, useInput, usePaste } from 'ink';
import { CURSOR_BLINK_INTERVAL_MS } from '../../../lib/constants';
import {
  EventName,
  subscribeEvent,
  unsubscribeEvent,
  type UserInputRequestEvent,
} from '../../../lib/events/events';
import { useAbort, useAgent } from '../../context';
import { useCommandProcessor } from '../../hooks/command-processor';
import { useUserInputField } from '../../context/user-input-context';
import { SuggestionType, useTerminalSize } from '../../hooks';
import { InformationBar } from '../information-bar';
import { Suggestions } from './input-suggestions';
import { InputRequest } from './option-request';

const INPUT_PLACEHOLDER = 'Reference files with @, and type commands using /';
const MIN_SUGGESTION_COUNT = 8;

export default function InputField(): JSX.Element {
  const { height } = useTerminalSize();
  const maxSuggestions = Math.ceil(
    Math.max(height / 2.5, MIN_SUGGESTION_COUNT)
  );

  const { processCommand } = useCommandProcessor();

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

  const handlePickSuggestion = useCallback(
    (type: SuggestionType, suggestion: string) => {
      setSuggestions(undefined);

      switch (type) {
        case SuggestionType.FILE: {
          setInput(prev => {
            const beforeCursor = prev.slice(0, suggestionCursorIndex);
            return `${beforeCursor + suggestion} ${prev.slice(cursorOffset)}`;
          });
          setCursorOffset(suggestionCursorIndex + suggestion.length + 1);
          break;
        }
        case SuggestionType.COMMAND: {
          setCursorOffset(0);
          setInput('');
          processCommand(suggestion);
          break;
        }
      }
    },
    [
      cursorOffset,
      processCommand,
      setCursorOffset,
      setInput,
      setSuggestions,
      suggestionCursorIndex,
    ]
  );

  useEffect(() => {
    setSuggestionIndex(0);
  }, [setSuggestionIndex, suggestions]);

  useEffect(() => {
    const handleInputRequest = (event: UserInputRequestEvent) =>
      setInputRequest(event.detail);

    subscribeEvent(EventName.REQUEST_INPUT, handleInputRequest);

    return () => {
      unsubscribeEvent(EventName.REQUEST_INPUT, handleInputRequest);
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
    if (suggestions && suggestions.values.length > 0) {
      const { values } = suggestions;
      if (key.upArrow) {
        setSuggestionIndex(prev => (prev + values.length - 1) % values.length);
        return;
      }

      if (key.downArrow) {
        setSuggestionIndex(prev => (prev + values.length + 1) % values.length);
        return;
      }

      if (key.escape) {
        setSuggestionIndex(-1);
        return;
      }

      if (key.tab || key.return) {
        handlePickSuggestion(suggestions.type, values[suggestionIndex].value);
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
      overflow="hidden"
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
      <InformationBar />
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

  if (input.length === 0) {
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
