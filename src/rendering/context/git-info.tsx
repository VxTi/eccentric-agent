import { exec } from 'child_process';
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

export interface GitInfo {
  currentBranch: string | undefined;
  repoName: string | undefined;
}

interface GitInfoContextProps {
  gitInfo: GitInfo | undefined;
  loading: boolean;
}

const GitInfoContext = createContext<GitInfoContextProps | undefined>(
  undefined
);

export function useGitInfo() {
  const context = useContext(GitInfoContext);

  if (!context) {
    throw new Error('useGitInfo must be used within GitInfo');
  }
  return context;
}

export function GitInfoProvider({ children }: { children: ReactNode }) {
  const [loading, startRetrieval] = useTransition();
  const [gitInfo, setGitInfo] = useState<GitInfo | undefined>();

  useEffect(() => {
    startRetrieval(async () => {
      const [currentBranch, repoName] = await Promise.all([
        execute('git branch --show-current', { timeout: 2000 }).then(
          res => res.stdout || undefined
        ),
        execute('basename `git rev-parse --show-toplevel`', {
          timeout: 2000,
        }).then(res => res.stdout || undefined),
      ]);

      setGitInfo({ currentBranch, repoName });
    });
  }, []);

  return (
    <GitInfoContext.Provider value={{ gitInfo, loading }}>
      {children}
    </GitInfoContext.Provider>
  );
}
