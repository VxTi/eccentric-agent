import { isNil } from '@vxti/typed';
import { type DOMElement, type Key, useInput, usePaste } from 'ink';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  EventName,
  eventOn,
  type UserInputRequest,
} from '../../lib/events/events';
import {
  getInputSuggestions,
  type Suggestions,
} from '../../lib/input-suggestions';
import { type Optional, wrapOptional } from '../../lib/optional';
import { useAppDispatch, useAppSelector } from '../../lib/state';
import { formatReferencedFiles } from '../components/user-input/input-field';
import { useAgent } from './agent-context';

interface InputRequestState {
  request: UserInputRequest;
  suggestionIndex: number;
}

interface InputState {
  cursorOffset: number;
  value: string;
}

export interface UserInputContextType {
  input: InputState;
  setInput: Dispatch<SetStateAction<InputState>>;
  inputRequest?: InputRequestState | undefined;
  setInputRequest: Dispatch<SetStateAction<InputRequestState | undefined>>;
  inputRef: RefObject<DOMElement | null>;

  suggestions?: Suggestions;
}

const UserInputContext = createContext<UserInputContextType | undefined>(
  undefined
);

export function UserInputProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const inputRef = useRef<DOMElement>(null);

  const [suggestions, setSuggestions] = useState<Suggestions>();
  const [inputRequest, setInputRequest] = useState<
    InputRequestState | undefined
  >(undefined);
  const [input, setInput] = useState<InputState>({
    cursorOffset: 0,
    value: '',
  });
  const { value, cursorOffset } = input;

  const { controller } = useAppSelector(state => state.app);
  const { submitMessage } = useAgent();

  useEffect(() => {
    getInputSuggestions(value, cursorOffset)
      .then(res => setSuggestions(res))
      .catch(() => {});
  }, [value, cursorOffset]);

  useEffect(() => {
    return eventOn(EventName.REQUEST_INPUT, ({ detail }) =>
      setInputRequest({ request: detail, suggestionIndex: 0 })
    );
  }, [dispatch]);

  const handleSubmitMessage = () => {
    submitMessage(formatReferencedFiles(value));
    setInput({ value: '', cursorOffset: 0 });
  };

  usePaste(text => {
    setInput(prev => ({
      value:
        prev.value.slice(0, cursorOffset) +
        text +
        prev.value.slice(cursorOffset),
      cursorOffset: cursorOffset + text.length,
    }));
  });

  useInput(
    (inputChar, key) => {
      if (key.ctrl && inputChar === 'c') {
        controller.abort();
      }

      if (key.return) {
        handleSubmitMessage();
        return;
      }

      const change = handleInput(inputChar, value, cursorOffset, key);

      if (change.hasValue) {
        const { offset, value } = change.value();

        setInput(prev => ({
          cursorOffset: offset,
          value: value ?? prev.value,
        }));
      }
    },
    { isActive: isNil(inputRequest) }
  );

  return (
    <UserInputContext.Provider
      value={{
        suggestions,
        input,
        setInput,
        inputRequest,
        setInputRequest,
        inputRef,
      }}
    >
      {children}
    </UserInputContext.Provider>
  );
}

function handleInput(
  inputChar: string,
  input: string,
  cursorOffset: number,
  key: Key
): Optional<{ value?: string; offset: number }> {
  return wrapOptional(() => {
    const direction = key.leftArrow ? -1 : key.rightArrow ? 1 : 0;

    // No change if already at the start and going left
    if (direction === -1 && cursorOffset === 0) return undefined;

    // If ctrl is not pressed we just move the cursor by one
    if (!key.ctrl) {
      return { offset: cursorOffset + direction };
    }

    if (direction === -1) {
      const start = input.slice(0, cursorOffset).trim();
      const nextIndex = Math.max(0, start.lastIndexOf(' '));
      return {
        offset: nextIndex,
        ...(key.backspace ? { value: input.slice(0, nextIndex) } : {}),
      };
    } else if (direction === 1) {
      const end = input.slice(cursorOffset);
      const nextIndex = cursorOffset + Math.max(end.indexOf(' '), 0);
      return {
        offset: nextIndex,
        ...(key.backspace ? { value: input.slice(nextIndex) } : {}),
      };
    }

    // Deleting characters
    if (key.backspace) {
      if (cursorOffset === 0) return;

      return {
        offset: cursorOffset - 1,
        value: input.slice(0, cursorOffset - 1) + input.slice(cursorOffset),
      };
    }

    // Handle regular input
    const newValue =
      input.slice(0, cursorOffset) + inputChar + input.slice(cursorOffset);
    return {
      value: newValue,
      offset: cursorOffset + 1,
    };
  });
}

export function useUserInputField(): UserInputContextType {
  const context = useContext(UserInputContext);

  if (!context) {
    throw new Error(
      'useUserInputField must be used within a UserInputContextProvider'
    );
  }
  return context;
}
