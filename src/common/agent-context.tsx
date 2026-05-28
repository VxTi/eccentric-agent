import { createContext, useContext, type ReactNode } from 'react';
import type { AgentRuntime } from './agent-runtime';

const AgentRuntimeContext = createContext<AgentRuntime | null>(null);

interface AgentProviderProps {
  runtime: AgentRuntime;
  children: ReactNode;
}

export function AgentProvider({
  runtime,
  children,
}: AgentProviderProps): ReactNode {
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
