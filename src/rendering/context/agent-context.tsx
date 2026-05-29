import { createContext, type ReactNode, useContext, useMemo } from 'react';
import {
  createInputQueue,
  createUserMessageQueue,
  type ManagedUserInputQueue,
  type UserMessageQueue,
} from '../../lib/agent-runtime';
import { TaskList } from '../../lib/task-list';
import { createFileSelector, type FileSelector } from '../../lib/file-selector';
import { FileCache } from '../../lib/file-cache';

export interface AgentContext {
  cwd: string;
  taskList: TaskList;
  fileSelector: FileSelector;
  fileCache: FileCache;
  inputQueue: ManagedUserInputQueue;
  userMessageQueue: UserMessageQueue;
  // subAgents: [];
}

const $AgentContext = createContext<AgentContext | null>(null);

export function AgentProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const runtime: AgentContext = useMemo(() => {
    const cwd = process.cwd();

    return {
      cwd,
      taskList: new TaskList(),
      fileCache: new FileCache(cwd),
      fileSelector: createFileSelector(cwd),
      inputQueue: createInputQueue(),
      userMessageQueue: createUserMessageQueue(),
    };
  }, []);

  return (
    <$AgentContext.Provider value={runtime}>{children}</$AgentContext.Provider>
  );
}

export function useAgent(): AgentContext {
  const runtime = useContext($AgentContext);
  if (!runtime) {
    throw new Error('useAgent must be used inside <AgentProvider>');
  }
  return runtime;
}
