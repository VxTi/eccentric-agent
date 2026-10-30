import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { UserInputRequest } from '../events/events';
import { CHANNEL_ID_NONE } from '../events/user-input';
import type { SuggestionSet } from '../../rendering/hooks';

export interface UserInputState {
  input: string;
  cursorOffset: number;
  suggestions: SuggestionSet | undefined;
  suggestionCursorIndex: number;
  suggestionIndex: number;
  inputRequest: UserInputRequest;
}

const initialState: UserInputState = {
  input: '',
  cursorOffset: 0,
  suggestions: undefined,
  suggestionCursorIndex: 0,
  suggestionIndex: 0,
  inputRequest: {
    channelId: CHANNEL_ID_NONE,
    options: [],
  },
};

export const userInputSlice = createSlice({
  name: 'userInput',
  initialState,
  reducers: {
    setInput: (state, action: PayloadAction<string>) => {
      state.input = action.payload;
    },
    setCursorOffset: (state, action: PayloadAction<number>) => {
      state.cursorOffset = action.payload;
    },
    setSuggestions: (
      state,
      action: PayloadAction<SuggestionSet | undefined>
    ) => {
      state.suggestions = action.payload;
    },
    setSuggestionCursorIndex: (state, action: PayloadAction<number>) => {
      state.suggestionCursorIndex = action.payload;
    },
    setSuggestionIndex: (state, action: PayloadAction<number>) => {
      state.suggestionIndex = action.payload;
    },
    setInputRequest: (state, action: PayloadAction<UserInputRequest>) => {
      state.inputRequest = action.payload;
    },
  },
});

export const {
  setInput,
  setCursorOffset,
  setSuggestions,
  setSuggestionCursorIndex,
  setSuggestionIndex,
  setInputRequest,
} = userInputSlice.actions;

export const userInput = {
  ...userInputSlice.actions,
  reducer: userInputSlice.reducer,
  slice: userInputSlice,
};
