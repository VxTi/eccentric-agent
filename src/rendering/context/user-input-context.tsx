import { isNonEmptyArray } from '@vxti/typed';
import { useInput, usePaste } from 'ink';
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
} from 'react';
import {
  EventName,
  eventOn,
  type UserInputRequest,
} from '../../lib/events/events';
import { useAppDispatch, useAppSelector, store } from '../../lib/state/store';
import {
  setInput as setInputAction,
  setCursorOffset as setCursorOffsetAction,
  setSuggestions as setSuggestionsAction,
  setSuggestionCursorIndex as setSuggestionCursorIndexAction,
  setSuggestionIndex as setSuggestionIndexAction,
  setInputRequest as setInputRequestAction,
} from '../../lib/state/user-input';
import { formatReferencedFiles } from '../components/user-input/input-field';
import {
  type SuggestionSet,
  SuggestionType,
  useInputSuggestionProvider,
} from '../hooks';
import { useCommandProcessor } from '../hooks/command-processor';
import { useAgent } from './agent-context';
import { useAppContext } from './app-context';

export interface UserInputContextType {
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

export function useUserInputField(): UserInputContextType {
  const dispatch = useAppDispatch();
  const {
    input,
    cursorOffset,
    suggestions,
    suggestionCursorIndex,
    suggestionIndex,
    inputRequest,
  } = useAppSelector(state => state.userInput);

  const setInput = useCallback<Dispatch<SetStateAction<string>>>(
    action => {
      const value =
        typeof action === 'function'
          ? action(store.getState().userInput.input)
          : action;
      dispatch(setInputAction(value));
    },
    [dispatch]
  );

  const setCursorOffset = useCallback<Dispatch<SetStateAction<number>>>(
    action => {
      const value =
        typeof action === 'function'
          ? action(store.getState().userInput.cursorOffset)
          : action;
      dispatch(setCursorOffsetAction(value));
    },
    [dispatch]
  );

  const setSuggestions = useCallback<
    Dispatch<SetStateAction<SuggestionSet | undefined>>
  >(
    action => {
      const value =
        typeof action === 'function'
          ? action(store.getState().userInput.suggestions)
          : action;
      dispatch(setSuggestionsAction(value));
    },
    [dispatch]
  );

  const setSuggestionIndex = useCallback<Dispatch<SetStateAction<number>>>(
    action => {
      const value =
        typeof action === 'function'
          ? action(store.getState().userInput.suggestionIndex)
          : action;
      dispatch(setSuggestionIndexAction(value));
    },
    [dispatch]
  );

  const setInputRequest = useCallback<
    Dispatch<SetStateAction<UserInputRequest>>
  >(
    action => {
      const value =
        typeof action === 'function'
          ? action(store.getState().userInput.inputRequest)
          : action;
      dispatch(setInputRequestAction(value));
    },
    [dispatch]
  );

  return {
    input,
    setInput,
    suggestions,
    setSuggestions,
    suggestionCursorIndex,
    suggestionIndex,
    setSuggestionIndex,
    cursorOffset,
    setCursorOffset,
    inputRequest,
    setInputRequest,
  };
}

export function UserInputProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const { input, cursorOffset, suggestions, suggestionIndex, inputRequest } =
    useUserInputField();

  const {
    suggestions: providerSuggestions,
    suggestionCursorIndex: providerSuggestionCursorIndex,
    setSuggestions,
  } = useInputSuggestionProvider(input, cursorOffset);

  const { controller } = useAppContext();
  const { submitMessage } = useAgent();
  const { processCommand } = useCommandProcessor();

  useEffect(() => {
    dispatch(setSuggestionsAction(providerSuggestions));
  }, [providerSuggestions, dispatch]);

  useEffect(() => {
    dispatch(setSuggestionCursorIndexAction(providerSuggestionCursorIndex));
  }, [providerSuggestionCursorIndex, dispatch]);

  const handlePickSuggestion = useCallback(
    (type: SuggestionType, suggestion: string) => {
      setSuggestions(undefined);

      switch (type) {
        case SuggestionType.FILE: {
          const currentInput = store.getState().userInput.input;
          const currentCursorIndex =
            store.getState().userInput.suggestionCursorIndex;
          const beforeCursor = currentInput.slice(0, currentCursorIndex);
          const afterCursor = currentInput.slice(cursorOffset);
          dispatch(
            setInputAction(`${beforeCursor + suggestion} ${afterCursor}`)
          );
          dispatch(
            setCursorOffsetAction(currentCursorIndex + suggestion.length + 1)
          );
          break;
        }
        case SuggestionType.COMMAND: {
          dispatch(setCursorOffsetAction(0));
          dispatch(setInputAction(''));
          processCommand(suggestion);
          break;
        }
      }
    },
    [cursorOffset, dispatch, processCommand, setSuggestions]
  );

  useEffect(() => {
    dispatch(setSuggestionIndexAction(0));
  }, [dispatch, suggestions]);

  useEffect(() => {
    return eventOn(EventName.REQUEST_INPUT, ({ detail }) =>
      dispatch(setInputRequestAction(detail))
    );
  }, [dispatch]);

  const handleSubmitMessage = () => {
    submitMessage(formatReferencedFiles(input));
    dispatch(setInputAction(''));
    dispatch(setCursorOffsetAction(0));
  };

  usePaste(text => {
    const updatedText = input + text;
    dispatch(setInputAction(updatedText));
    dispatch(setCursorOffsetAction(cursorOffset + text.length));
  });

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'c') {
      controller.abort();
    }

    // Handled in another component
    if (isNonEmptyArray(inputRequest.options)) return;

    // Suggestion handling
    if (suggestions && suggestions.values.length > 0) {
      const { values } = suggestions;
      if (key.upArrow) {
        dispatch(
          setSuggestionIndexAction(
            (suggestionIndex + values.length - 1) % values.length
          )
        );
        return;
      }

      if (key.downArrow) {
        dispatch(
          setSuggestionIndexAction((suggestionIndex + 1) % values.length)
        );
        return;
      }

      if (key.escape) {
        dispatch(setSuggestionIndexAction(-1));
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

      dispatch(
        setInputAction(
          input.slice(0, cursorOffset - 1) + input.slice(cursorOffset)
        )
      );
      dispatch(setCursorOffsetAction(cursorOffset - 1));
      return;
    }

    if (key.leftArrow) {
      if (cursorOffset === 0) return;
      dispatch(setCursorOffsetAction(cursorOffset - 1));
      return;
    }

    if (key.rightArrow) {
      if (cursorOffset >= input.length) return;
      dispatch(setCursorOffsetAction(cursorOffset + 1));
      return;
    }

    if (!key.ctrl && !key.meta && inputChar.length === 1 && inputChar >= ' ') {
      dispatch(
        setInputAction(
          input.slice(0, cursorOffset) + inputChar + input.slice(cursorOffset)
        )
      );
      dispatch(setCursorOffsetAction(cursorOffset + 1));
      return;
    }
  });

  return <>{children}</>;
}
