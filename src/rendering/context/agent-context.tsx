import { createContext, type ReactNode, useContext, useMemo } from 'react';
import {
  createInputQueue,
  createUserMessageQueue,
  type ManagedUserInputQueue,
  type UserMessageQueue,
} from '../../agent-runtime';
import { TaskList } from '../../task-list';
import { createFileSelector, type FileSelector } from '../../file-selector';
import { FileCache } from '../../lib/file-cache';

export interface AgentRuntime {
  cwd: string;
  taskList: TaskList;
  fileSelector: FileSelector;
  fileCache: FileCache;
  inputQueue: ManagedUserInputQueue;
  userMessageQueue: UserMessageQueue;
  // subAgents: [];
}

const AgentRuntimeContext = createContext<AgentRuntime | null>(null);

export function AgentProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const runtime: AgentRuntime = useMemo(() => {
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
    <AgentRuntimeContext.Provider value={runtime}>
      {children}
    </AgentRuntimeContext.Provider>
  );
}

export function useAgent(): AgentRuntime {
  const runtime = useContext(AgentRuntimeContext);
  if (!runtime) {
    throw new Error('useAgent must be used inside <AgentProvider>');
  }
  return runtime;
}
