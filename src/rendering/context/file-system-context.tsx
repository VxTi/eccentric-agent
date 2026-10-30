import { isNonEmptyString, toNonEmptyString } from '@vxti/typed';
import { exec } from 'child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { type ReactNode, useEffect, useTransition } from 'react';
import { useAppDispatch, useAppSelector } from '../../lib/state/store';
import {
  setGitInfo,
  setLoading,
  type GitInfo,
} from '../../lib/state/file-system';

const execute = promisify(exec);

export interface FileSystemContext {
  git: GitInfo;
  loading: boolean;
  cwd: string;
}

export function useFileSystem(): FileSystemContext {
  return useAppSelector(state => state.fileSystem);
}

export function FileSystemProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const [, startRetrieval] = useTransition();

  useEffect(() => {
    dispatch(setLoading(true));
    startRetrieval(async () => {
      const [currentBranch, repoName, gitIgnored] = await Promise.all([
        execute('git branch --show-current', { timeout: 2000 })
          .then(res => toNonEmptyString(res.stdout))
          .catch(() => undefined),

        execute('git rev-parse --show-toplevel', {
          timeout: 2000,
        })
          .then(res => toNonEmptyString(path.basename(res.stdout)))
          .catch(() => undefined),

        execute('git check-ignore *', {
          timeout: 2000,
        })
          .then(res => {
            return new Set<string>(
              res.stdout
                .split('\n')
                .map(line => line.trim())
                .filter(line => isNonEmptyString(line, true))
            );
          })
          .catch(() => new Set<string>()),
      ]);

      dispatch(setGitInfo({ currentBranch, repoName, ignored: gitIgnored }));
      dispatch(setLoading(false));
    });
  }, [dispatch]);

  return <>{children}</>;
}
