import {
  isNonEmptyString,
  type NonEmptyString,
  type Nullable,
  toNonEmptyString,
} from '@vxti/typed';
import { exec } from 'child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useTransition,
} from 'react';

const execute = promisify(exec);

export interface FileSystemContext {
  git: {
    currentBranch?: Nullable<NonEmptyString>;
    repoName?: Nullable<NonEmptyString>;
    ignored: Set<string>;
  };
  loading: boolean;
  cwd: string;
}

const FileSystemContext = createContext<FileSystemContext | undefined>(
  undefined
);

export function useFileSystem() {
  const context = useContext(FileSystemContext);

  if (!context) {
    throw new Error('useGitInfo must be used within GitInfo');
  }
  return context;
}

export function FileSystemProvider({ children }: { children: ReactNode }) {
  const [loading, startRetrieval] = useTransition();
  const [gitInfo, setGitInfo] = useState<FileSystemContext['git']>({
    ignored: new Set<string>(),
  });
  const [cwd] = useState<string>(process.cwd());

  useEffect(() => {
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

      setGitInfo({ currentBranch, repoName, ignored: gitIgnored });
    });
  }, []);

  return (
    <FileSystemContext.Provider value={{ git: gitInfo, cwd, loading }}>
      {children}
    </FileSystemContext.Provider>
  );
}
