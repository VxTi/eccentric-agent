import {
  isEmptyString,
  isNil,
  isNonEmptyArray,
  isNonEmptyString,
  type Nullable,
} from '@vxti/typed';
import { type DOMElement, type Key, useInput, usePaste } from 'ink';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { v7 as uuid } from 'uuid';
import {
  EventName,
  eventOn,
  type UserInputRequest,
  type UserInputRequestEvent,
} from '../../lib/events/events';
import {
  getInputSuggestions,
  type Suggestions,
} from '../../lib/input-suggestions';
import { type Optional, wrapOptional } from '../../lib/optional';
import { useAppSelector } from '../../lib/state';
import { formatReferencedFiles } from '../components/user-input/input-field';
import { useAgent } from '../hooks';

export interface InputRequestState {
  id: string;
  request: UserInputRequest;
  suggestionIndex: number;
}

interface InputState {
  cursorOffset: number;
  value: string;
}

export interface InputAreaContextInstance {
  input: InputState;
  setInput: Dispatch<SetStateAction<InputState>>;
  inputRequest?: InputRequestState | undefined;
  setInputRequest: Dispatch<SetStateAction<InputRequestState | undefined>>;
  inputRef: RefObject<DOMElement | null>;

  suggestions: Nullable<Suggestions>;
  setSuggestions: Dispatch<SetStateAction<Nullable<Suggestions>>>;
}

export const UserInputContext = createContext<
  InputAreaContextInstance | undefined
>(undefined);

export function UserInputProvider({ children }: { children: ReactNode }) {
  const inputRef = useRef<DOMElement>(null);

  const [suggestions, setSuggestions] = useState<Nullable<Suggestions>>();

  // Pending input requests are served one at a time, oldest first. New requests
  // are appended to the tail; the head is the one currently shown. Without this
  // a second request would overwrite the first, leaving its awaiter hung.
  const [requestQueue, setRequestQueue] = useState<InputRequestState[]>([]);
  const inputRequest = requestQueue[0];

  // Preserve the single-request setter contract: `undefined` dismisses the
  // current request and advances to the next queued one; a concrete value
  // replaces the head in place.
  const setInputRequest = useCallback<
    Dispatch<SetStateAction<InputRequestState | undefined>>
  >(action => {
    setRequestQueue(prev => {
      const current = prev[0];
      const next = typeof action === 'function' ? action(current) : action;

      if (isNil(next)) return prev.slice(1);
      return [next, ...prev.slice(1)];
    });
  }, []);

  const [input, setInput] = useState<InputState>({
    cursorOffset: 0,
    value: '',
  });
  const { value, cursorOffset } = input;

  const { controller } = useAppSelector(state => state.app);
  const historyEntries = useAppSelector(state => state.chatHistory.entries);
  const { submitMessage, toggleAutoApprove, agent } = useAgent();

  // Position within `historyEntries` while recalling past prompts with the
  // arrows; `null` means history mode is off. Kept in a ref because the
  // recalled text itself lives in `input` and must not re-render through here.
  const historyIndex = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    getInputSuggestions(value, cursorOffset)
      .then(res => {
        if (!cancelled) setSuggestions(res);
      })
      .catch(() => {
        if (!cancelled) setSuggestions(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [value, cursorOffset]);

  useEffect(() => {
    return eventOn(
      EventName.REQUEST_INPUT,
      ({ detail }: UserInputRequestEvent<string>) => {
        setRequestQueue(prev => [
          ...prev,
          { id: uuid(), request: detail, suggestionIndex: 0 },
        ]);
      }
    );
  }, []);

  const handleSubmitMessage = () => {
    submitMessage(formatReferencedFiles(value));
    historyIndex.current = null;
    setInput({ value: '', cursorOffset: 0 });
  };

  /**
   * Recalls previously submitted prompts with the arrow keys. Up enters
   * history mode from an empty input and steps towards older entries; Down
   * steps back towards newer ones and leaves history mode once past the
   * newest, restoring the empty input. Any typed edit exits history mode.
   */
  const browseHistory = useCallback(
    (older: boolean): void => {
      if (!isNonEmptyArray(historyEntries)) return;

      if (older) {
        // Recall only starts from an empty input; once browsing, an emptied
        // input (e.g. after a suggestion command) restarts from the newest.
        if (historyIndex.current === null && !isEmptyString(value)) return;

        const index =
          historyIndex.current === null || isEmptyString(value)
            ? historyEntries.length - 1
            : Math.max(0, historyIndex.current - 1);
        historyIndex.current = index;
        const valueAtIndex = historyEntries[index];
        if (!isNonEmptyString(valueAtIndex)) return;
        setInput({
          value: valueAtIndex,
          cursorOffset: valueAtIndex.length,
        });
        return;
      }

      if (historyIndex.current === null) return;

      const index = historyIndex.current + 1;
      historyIndex.current = index < historyEntries.length ? index : null;

      const valueAtIndex = historyEntries[index];
      if (!isNonEmptyString(valueAtIndex)) return;
      setInput(
        index < historyEntries.length
          ? {
              value: valueAtIndex,
              cursorOffset: valueAtIndex.length,
            }
          : { value: '', cursorOffset: 0 }
      );
    },
    [historyEntries, value]
  );

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
      // Ctrl+C interrupts an in-flight turn so the user can redirect the agent
      // with a follow-up message; only once the agent is idle does it quit.
      if (key.ctrl && inputChar === 'c') {
        if (agent.status.loading) {
          agent.cancel();
          return;
        }
        controller.abort();
        return;
      }

      // Ctrl+A toggles Auto mode (auto-approve safe shell commands).
      if (key.ctrl && inputChar === 'a') {
        toggleAutoApprove();
        return;
      }

      // When suggestions are open, Enter/Tab belong to the suggestion list (it
      // picks the highlighted entry), so don't also submit the message here.
      // Arrow keys fall through: Up/Down are ignored by handleInput below and
      // used by the list for navigation, Left/Right still move the cursor.
      if (isNonEmptyArray(suggestions?.values) && (key.return || key.tab)) {
        return;
      }

      if (key.return) {
        handleSubmitMessage();
        return;
      }

      // History recall owns the arrows when no suggestion list is open; the
      // list navigates its entries with Up/Down while it is visible.
      if (
        !isNonEmptyArray(suggestions?.values) &&
        (key.upArrow || key.downArrow)
      ) {
        browseHistory(key.upArrow);
        return;
      }

      const change = handleInput(inputChar, value, cursorOffset, key);

      if (change.hasValue) {
        const { offset, value } = change.value();

        // Editing the text abandons history recall; a pure cursor move (no
        // new value) keeps the position so Up/Down can resume where they were.
        if (value !== undefined) {
          historyIndex.current = null;
        }

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
        setSuggestions,
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
