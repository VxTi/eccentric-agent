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
    const skipWord = key.ctrl || key.meta || key.super;

    // macOS terminals with "Option as Meta" send Option+Left/Right as
    // Meta+b / Meta+f (ESC b / ESC f) rather than as arrow escape sequences,
    // so the arrow flags are not set. Treat those as word-wise movement too.
    const metaWord =
      key.meta && !key.leftArrow && !key.rightArrow
        ? inputChar === 'b'
          ? -1
          : inputChar === 'f'
            ? 1
            : 0
        : 0;

    // Word deletion: Option+Delete (meta+backspace) removes the word before
    // the cursor; Option+fn+Delete (meta+delete) removes the word after it.
    const deleteWord = skipWord ? (key.backspace ? -1 : key.delete ? 1 : 0) : 0;

    const direction = key.leftArrow
      ? -1
      : key.rightArrow
        ? 1
        : metaWord !== 0
          ? metaWord
          : deleteWord;

    if (direction !== 0 && !skipWord) {
      // If ctrl is not pressed we just move the cursor by one
      return {
        offset: Math.max(0, Math.min(cursorOffset + direction, input.length)),
      };
    }

    // No change if already at the start and going left
    if (direction === -1 && cursorOffset === 0) return undefined;

    if (skipWord && direction !== 0) {
      const nextIndex = findWordBoundary(input, cursorOffset, direction);
      const isDelete = key.backspace || key.delete;

      if (direction === -1) {
        return {
          offset: nextIndex,
          ...(isDelete
            ? { value: input.slice(0, nextIndex) + input.slice(cursorOffset) }
            : {}),
        };
      }

      return {
        offset: isDelete ? cursorOffset : nextIndex,
        ...(isDelete
          ? { value: input.slice(0, cursorOffset) + input.slice(nextIndex) }
          : {}),
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

    if (inputChar.length !== 1) return;

    // Handle regular input
    const newValue =
      input.slice(0, cursorOffset) + inputChar + input.slice(cursorOffset);
    return {
      value: newValue,
      offset: cursorOffset + 1,
    };
  });
}

/**
 * Finds the cursor position one word away from `cursorOffset`. Going left skips
 * any spaces immediately before the cursor, then the word before those; going
 * right skips any spaces at the cursor, then the word after them.
 */
function findWordBoundary(
  input: string,
  cursorOffset: number,
  direction: number
): number {
  let index = cursorOffset;

  if (direction < 0) {
    while (index > 0 && input[index - 1] === ' ') index--;
    while (index > 0 && input[index - 1] !== ' ') index--;
  } else {
    while (index < input.length && input[index] === ' ') index++;
    while (index < input.length && input[index] !== ' ') index++;
  }

  return index;
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
