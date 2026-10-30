import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { NonEmptyString, Nullable } from '@vxti/typed';

export interface GitInfo {
  currentBranch?: Nullable<NonEmptyString>;
  repoName?: Nullable<NonEmptyString>;
  ignored: Set<string>;
}

export interface FileSystemState {
  git: GitInfo;
  loading: boolean;
  cwd: string;
}

const initialState: FileSystemState = {
  git: {
    ignored: new Set<string>(),
  },
  loading: false,
  cwd: process.cwd(),
};

export const fileSystemSlice = createSlice({
  name: 'fileSystem',
  initialState,
  reducers: {
    setGitInfo: (state, action: PayloadAction<GitInfo>) => {
      state.git = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setCwd: (state, action: PayloadAction<string>) => {
      state.cwd = action.payload;
    },
  },
});

export const { setGitInfo, setLoading, setCwd } = fileSystemSlice.actions;

export const fileSystem = {
  ...fileSystemSlice.actions,
  reducer: fileSystemSlice.reducer,
  slice: fileSystemSlice,
};
