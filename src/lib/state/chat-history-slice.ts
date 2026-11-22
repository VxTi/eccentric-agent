import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ChatHistoryState {
  /** Previously submitted user prompts, oldest first. Drives arrow-key
   *  history recall in the input field. */
  entries: string[];
}

const initialState: ChatHistoryState = { entries: [] };

export const chatHistorySlice = createSlice({
  name: 'chatHistory',
  initialState,
  reducers: {
    pushEntry: (state, action: PayloadAction<string>) => {
      state.entries.push(action.payload);
    },
    clearHistory: state => {
      state.entries = [];
    },
  },
});

export const { pushEntry, clearHistory } = chatHistorySlice.actions;

export const chatHistory = {
  ...chatHistorySlice.actions,
  reducer: chatHistorySlice.reducer,
  slice: chatHistorySlice,
};
