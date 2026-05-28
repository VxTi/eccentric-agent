import {
  createContext,
  useContext,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
  useMemo,
} from 'react';
import { type MessageState, MessageStore } from '../message-store';

const MessageStoreContext = createContext<MessageStore | null>(null);

export function MessagesProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const store = useMemo(() => {
    return new MessageStore();
  }, []);

  return (
    <MessageStoreContext.Provider value={store}>
      {children}
    </MessageStoreContext.Provider>
  );
}

export function useMessageStore(): MessageStore {
  const store = useContext(MessageStoreContext);
  if (!store) {
    throw new Error('useMessageStore must be used inside <MessageProvider>');
  }
  return store;
}

export function useMessageState(): MessageState {
  const store = useMessageStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}
