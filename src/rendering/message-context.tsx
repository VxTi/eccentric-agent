import {
  createContext,
  useContext,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from 'react';
import type { MessageState, MessageStore } from './message-store';

const MessageStoreContext = createContext<MessageStore | null>(null);

interface MessageProviderProps {
  store: MessageStore;
  children: ReactNode;
}

export function MessageProvider({
  store,
  children,
}: MessageProviderProps): JSX.Element {
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
