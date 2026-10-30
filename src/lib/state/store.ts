import { configureStore } from '@reduxjs/toolkit';
import {
  type TypedUseSelectorHook,
  useDispatch,
  useSelector,
} from 'react-redux';
import { agentSlice } from './agent';
import { fileSystemSlice } from './file-system';
import { userInputSlice } from './user-input';
import { appSlice } from './app';

export const makeStore = () => {
  return configureStore({
    reducer: {
      agent: agentSlice.reducer,
      fileSystem: fileSystemSlice.reducer,
      userInput: userInputSlice.reducer,
      app: appSlice.reducer,
    },
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
  });
};

export const store = makeStore();

export type AppStore = typeof store;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
