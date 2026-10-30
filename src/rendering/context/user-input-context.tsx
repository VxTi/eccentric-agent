import { isNonEmptyArray } from '@vxti/typed';
import { useInput, usePaste } from 'ink';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  EventName,
  eventOn,
  type UserInputRequest,
} from '../../lib/events/events';
import { CHANNEL_ID_NONE } from '../../lib/events/user-input';
import { formatReferencedFiles } from '../components/user-input/input-field';
import {
  type SuggestionSet,
  SuggestionType,
  useInputSuggestionProvider,
} from '../hooks';
import { useCommandProcessor } from '../hooks/command-processor';
import { useAgent } from './agent-context';
import { useAppContext } from './app-context';

interface UserInputContextType {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  suggestions: SuggestionSet | undefined;
  setSuggestions: Dispatch<SetStateAction<SuggestionSet | undefined>>;
  suggestionCursorIndex: number;
  suggestionIndex: number;
  setSuggestionIndex: Dispatch<SetStateAction<number>>;
  cursorOffset: number;
  setCursorOffset: Dispatch<SetStateAction<number>>;
  inputRequest: UserInputRequest;
  setInputRequest: Dispatch<SetStateAction<UserInputRequest>>;
}

const UserInputContext = createContext<UserInputContextType | undefined>(
  undefined
);

export function useUserInputField() {
  const context = useContext(UserInputContext);
  if (!context) {
    throw new Error('useInputField() must be used within useInputField()');
  }

  return context;
}

export function UserInputProvider({ children }: { children: ReactNode }) {
  const [cursorOffset, setCursorOffset] = useState<number>(0);
  const [input, setInput] = useState<string>('');

  const { suggestions, suggestionCursorIndex, setSuggestions } =
    useInputSuggestionProvider(input, cursorOffset);

  const [inputRequest, setInputRequest] = useState<UserInputRequest>({
    channelId: CHANNEL_ID_NONE,
    options: [],
  });

  const { controller } = useAppContext();
  const { submitMessage } = useAgent();
  const { processCommand } = useCommandProcessor();
  const [suggestionIndex, setSuggestionIndex] = useState<number>(0);

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
    return eventOn(EventName.REQUEST_INPUT, ({ detail }) =>
      setInputRequest(detail)
    );
  }, [setInputRequest]);

  const handleSubmitMessage = () => {
    submitMessage(formatReferencedFiles(input));
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
    if (isNonEmptyArray(inputRequest.options)) return;

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
        handlePickSuggestion(
          suggestions.type,
          values[suggestionIndex]?.value ?? ''
        );
        return;
      }
    }

    if (key.return) {
      handleSubmitMessage();
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

    if (!key.ctrl && !key.meta && inputChar.length === 1 && inputChar >= ' ') {
      setInput(
        prev =>
          prev.slice(0, cursorOffset) + inputChar + prev.slice(cursorOffset)
      );
      setCursorOffset(prev => prev + 1);
      return;
    }
  });

  return (
    <UserInputContext.Provider
      value={{
        input,
        setInput,
        suggestions,
        setSuggestions,
        suggestionIndex,
        setSuggestionIndex,
        suggestionCursorIndex,
        setCursorOffset,
        cursorOffset,
        inputRequest,
        setInputRequest,
      }}
    >
      {children}
    </UserInputContext.Provider>
  );
}
