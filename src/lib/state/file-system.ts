import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import {
  isNonEmptyString,
  toNonEmptyString,
  type NonEmptyString,
  type Nullable,
} from '@vxti/typed';
import { exec } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(exec);

export interface GitInfo {
  currentBranch?: Nullable<NonEmptyString>;
  repoName?: Nullable<NonEmptyString>;
  ignored: Set<string>; // Serialized as an array for Redux safety
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

/**
 * Async thunk that reads Git repository details from cwd.
 */
export const fetchGitInfo = createAsyncThunk<
  GitInfo,
  void,
  { state: { fileSystem: FileSystemState } }
>('fileSystem/fetchGitInfo', async (_, { getState }) => {
  const { cwd } = getState().fileSystem;
  const execOpts = { cwd, timeout: 2000 };

  const [currentBranch, repoName, gitIgnored] = await Promise.all([
    execute('git branch --show-current', execOpts)
      .then(res => toNonEmptyString(res.stdout.trim()))
      .catch(() => undefined),

    execute('git rev-parse --show-toplevel', execOpts)
      .then(res => toNonEmptyString(path.basename(res.stdout.trim())))
      .catch(() => undefined),

    execute('git check-ignore *', execOpts)
      .then(
        res =>
          new Set(
            res.stdout
              .split('\n')
              .map(line => line.trim())
              .filter(line => isNonEmptyString(line, true))
          )
      )
      // `git check-ignore` exits non-zero when nothing is ignored or the
      // directory is not a git repo; treat both as "nothing to exclude".
      .catch(() => new Set<string>()),
  ]);

  return {
    currentBranch,
    repoName,
    ignored: gitIgnored,
  };
});

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
  extraReducers: builder => {
    builder
      .addCase(fetchGitInfo.pending, state => {
        state.loading = true;
      })
      .addCase(fetchGitInfo.fulfilled, (state, action) => {
        state.loading = false;
        state.git = action.payload;
      })
      .addCase(fetchGitInfo.rejected, state => {
        state.loading = false;
      });
  },
});

export const { setGitInfo, setLoading, setCwd } = fileSystemSlice.actions;

export const fileSystem = {
  ...fileSystemSlice.actions,
  fetchGitInfo,
  reducer: fileSystemSlice.reducer,
  slice: fileSystemSlice,
};
