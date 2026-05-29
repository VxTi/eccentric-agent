import { type ModelMessage } from 'ai';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { FileCache } from '../../lib/file-cache';
import { TaskList } from '../../lib/tasks';

export type Message = Extract<ModelMessage, { role: 'assistant' | 'user' }>;

export interface AgentContext {
  cwd: string;
  setCwd: Dispatch<SetStateAction<string>>;
  submitMessage: (input: string) => void;
  taskList: TaskList;
  fileCache: FileCache;
  messages: Message[];

  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;

  statusText: string;
  setStatusText: Dispatch<SetStateAction<string>>;
}

const PrimaryAgentContext = createContext<AgentContext | null>(null);

export function AgentProvider({ children }: { children: ReactNode }): ReactNode {
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [cwd, setCwd] = useState<string>(process.cwd());
  const [messages, setMessages] = useState<ModelMessage[]>([]);

  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState<string>('');

  const fileCache = useMemo(() => new FileCache(cwd), [cwd]);
  const taskList = useMemo(() => new TaskList(), []);

  const submitMessage = useCallback(
    (input: string) => {
      setMessageQueue(prev => {
        // if (prev.length === 0) const totalQueue = [...prev, input];
      });
    },
    [messageQueue.length]
  );

  return (
    <PrimaryAgentContext.Provider
      value={{
        messages: messages.filter((m): m is Message => m.role === 'user' || m.role === 'assistant'),
        cwd,
        setCwd,
        submitMessage,
        taskList,
        fileCache,
        statusText,
        setStatusText,
        loading,
        setLoading,
      }}
    >
      {children}
    </PrimaryAgentContext.Provider>
  );
}

export function useAgent(): AgentContext {
  const runtime = useContext(PrimaryAgentContext);
  if (!runtime) {
    throw new Error('useAgent must be used inside <AgentProvider>');
  }
  return runtime;
}
