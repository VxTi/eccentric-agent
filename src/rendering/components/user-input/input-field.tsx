import {
  type Dispatch,
  type JSX,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Box, Text, useInput, usePaste } from 'ink';
import {
  emitEvent,
  EventName,
  subscribeEvent,
  unsubscribeEvent,
  type UserInputRequest,
  type UserInputRequestEvent,
  UserInputResponseEvent,
} from '../../../lib/events';
import { useAbort, useAgent } from '../../context';
import { useInputSuggestionProvider } from '../../hooks';

const MAX_SHOWN_SUGGESTIONS = 10;

export default function InputField(): JSX.Element {
  const [cursorOffset, setCursorOffset] = useState<number>(0);
  const [input, setInput] = useState<string>('');
  const { suggestions } = useInputSuggestionProvider(input, cursorOffset);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(0);
  const controller = useAbort();
  const agent = useAgent();

  // Handling of user input requests
  const [inputRequest, setInputRequest] = useState<UserInputRequest | undefined>(undefined);

  useEffect(() => {
    const handleInputRequest = (event: UserInputRequestEvent) => setInputRequest(event.detail);

    subscribeEvent(EventName.REQUEST_USER_INPUT, handleInputRequest);

    return () => {
      unsubscribeEvent(EventName.REQUEST_USER_INPUT, handleInputRequest);
    };
  }, []);

  const submitMessage = () => {
    agent.submitMessage(input);
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
    if (inputRequest) return;

    // Suggestion handling
    if (suggestions.length > 0) {
      if (key.upArrow) {
        setSelectedSuggestionIndex(prev => (prev + suggestions.length - 1) % suggestions.length);
        return;
      }

      if (key.downArrow) {
        setSelectedSuggestionIndex(prev => (prev + suggestions.length + 1) % suggestions.length);
        return;
      }

      if (key.escape) {
        setSelectedSuggestionIndex(-1);
        return;
      }

      if (key.tab || key.return) {
        if (selectedSuggestionIndex > -1) {
          setInput(prev => prev + suggestions[selectedSuggestionIndex]);
        }
        return;
      }
    }

    if (key.return) {
      submitMessage();
      return;
    }

    if (key.backspace || key.delete) {
      if (cursorOffset === 0) return;

      setInput(prev => prev.slice(0, cursorOffset - 1) + prev.slice(cursorOffset));
      setCursorOffset(prev => prev - 1);
      return;
    }

    if (key.leftArrow) {
      if (cursorOffset === 0) return;
      setCursorOffset(prev => prev - 1);
      return;
    }

    if (key.rightArrow) {
      if (cursorOffset > inputChar.length) return;
      setCursorOffset(prev => prev + 1);
      return;
    }

    if (inputChar && !key.ctrl && !key.meta && inputChar.length === 1 && inputChar >= ' ') {
      setInput(prev => prev.slice(0, cursorOffset) + inputChar + prev.slice(cursorOffset));
      setCursorOffset(prev => prev + 1);
      return;
    }
  });

  if (inputRequest) {
    return <InputRequest inputRequest={inputRequest} setInputRequest={setInputRequest} />;
  }

  return (
    <Box width="80%" alignSelf="center" flexDirection="column">
      <Suggestions suggestions={suggestions} selectedIndex={selectedSuggestionIndex} />
      <Box backgroundColor="gray" paddingY={1} paddingX={1} flexDirection="column">
        <InputText input={input} cursor={cursorOffset} />
      </Box>
    </Box>
  );
}

interface InputRequestProps {
  inputRequest: UserInputRequest;
  setInputRequest: Dispatch<SetStateAction<UserInputRequest | undefined>>;
}

function InputRequest({ inputRequest, setInputRequest }: InputRequestProps): ReactNode {
  const [userSelectedInputIndex, setUserSelectedInputIndex] = useState<number>(0);

  useInput((_input, key) => {
    if (key.upArrow) {
      setUserSelectedInputIndex(
        prev => (prev + inputRequest.options.length - 1) % inputRequest.options.length
      );
    } else if (key.downArrow) {
      setUserSelectedInputIndex(
        prev => (prev + inputRequest.options.length + 1) % inputRequest.options.length
      );
    } else if (key.return || key.tab) {
      emitEvent(new UserInputResponseEvent(inputRequest.options[userSelectedInputIndex]));

      setInputRequest(undefined);
      setUserSelectedInputIndex(-1);
    }
  });

  return (
    <Box width="80%" alignSelf="center" flexDirection="column">
      <Box flexDirection="column" alignItems="center">
        <Text bold color="white">
          {inputRequest.title}
        </Text>
        <Text color="gray">{inputRequest.description}</Text>
      </Box>
      <Box marginTop={1} marginLeft={2}>
        {inputRequest.options.map((option, i) => (
          <Text key={i} color={i === userSelectedInputIndex ? 'red' : 'white'}>
            {option.label}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

interface InputTextProps {
  input: string;
  cursor: number;
}

function InputText({ input, cursor }: InputTextProps): ReactNode {
  const safeCursor = Math.max(0, Math.min(cursor, input.length));
  const before = input.slice(0, safeCursor);
  const cursorChar = input[safeCursor] ?? ' ';
  const after = input.slice(safeCursor + 1);

  const [blinkState, setBlinkState] = useState<boolean>(false);

  useEffect(() => {
    const id = setInterval(() => setBlinkState(prev => !prev), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <Box>
      <Text>{before}</Text>
      <Box borderLeftColor="white" borderLeft={blinkState}>
        <Text>{cursorChar}</Text>
      </Box>
      <Text>{after}</Text>
    </Box>
  );
}

interface SuggestionTextProps {
  children: string;
  selected: boolean;
}

function SuggestionText({ children, selected }: SuggestionTextProps): ReactNode {
  return (
    <Text color={selected ? 'redBright' : 'white'}>
      {selected ? '→ ' : '  '}
      {children}
    </Text>
  );
}

interface SuggestionsProps {
  suggestions: string[];
  selectedIndex: number;
}

function Suggestions({ suggestions, selectedIndex }: SuggestionsProps): ReactNode {
  const state = useMemo(() => {
    if (suggestions.length === 0) return undefined;

    if (suggestions.length <= MAX_SHOWN_SUGGESTIONS) {
      return {
        shown: suggestions,
        additional: 0,
        offsetIndex: 0,
      };
    }

    const halfWindow = Math.floor(MAX_SHOWN_SUGGESTIONS / 2);
    const maxOffset = suggestions.length - MAX_SHOWN_SUGGESTIONS;

    const targetOffset = selectedIndex - halfWindow;

    const offsetIndex = Math.max(0, Math.min(maxOffset, targetOffset));
    const offsetUpperBound = offsetIndex + MAX_SHOWN_SUGGESTIONS;

    return {
      offsetIndex,
      shown: suggestions.slice(offsetIndex, offsetUpperBound),
      additional: suggestions.length - offsetUpperBound,
    };
  }, [suggestions, selectedIndex]);

  if (!state) return;

  return (
    <Box flexDirection="column">
      {state.shown.map((suggestion, i) => (
        <SuggestionText key={i} selected={selectedIndex === i + state.offsetIndex}>
          {suggestion}
        </SuggestionText>
      ))}
      {state.additional > 0 && <Text color="gray">+{state.additional} more</Text>}
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
