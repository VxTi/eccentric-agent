import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';
import { formatMarkdown } from '../formatting';

interface MessageContextProps {
  value: string;
  setValue: (value: string) => void;
}

const MessageContext = createContext<MessageContextProps | null>(null);

export function useMessage() {
  const ctx = useContext(MessageContext);
  if (!ctx) {
    throw new Error('useMessage must be used within the context');
  }

  return ctx;
}

export function MessageProvider({ children }: { children: ReactNode }) {
  const [value, setValueInternal] = useState<string>('');

  const setValue = useCallback(
    (value: string) => {
      setValueInternal(formatMarkdown(value));
    },
    [value]
  );

  return (
    <MessageContext.Provider
      value={{
        value,
        setValue,
      }}
    >
      {children}
    </MessageContext.Provider>
  );
}
