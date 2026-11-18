import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface AppState {
  controller: AbortController;
  io: {
    stdin: NodeJS.ReadStream;
    stdout: NodeJS.WriteStream;
  };
}

// Shared across the app: ctrl+C (user input) and the `exit`/`quit` commands
// abort this controller, and the agent runs its inference against its signal so
// those actions interrupt an in-flight turn.
export const defaultController = new AbortController();
const initialState: AppState = {
  controller: defaultController,
  io: {
    stdin: process.stdin,
    stdout: process.stdout,
  },
};

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setController: (state, action: PayloadAction<AbortController>) => {
      state.controller = action.payload;
    },
    setIO: (
      state,
      action: PayloadAction<{
        stdin: NodeJS.ReadStream;
        stdout: NodeJS.WriteStream;
      }>
    ) => {
      state.io = action.payload;
    },
    exit: state => {
      state.controller.abort();
    },
  },
});

export const { setController, setIO, exit } = appSlice.actions;

export const app = {
  ...appSlice.actions,
  reducer: appSlice.reducer,
  slice: appSlice,
};
