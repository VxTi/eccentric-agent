import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useState,
} from 'react';
import type { UserInputRequest } from '../../lib/events/events';
import { CHANNEL_ID_NONE } from '../../lib/events/user-input';
import { type SuggestionSet, useInputSuggestionProvider } from '../hooks';

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

  const [suggestionIndex, setSuggestionIndex] = useState<number>(0);

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
