import { createContext, type ReactNode, useCallback, useContext } from 'react';

export interface AppContextType {
  controller: AbortController;
  io: {
    stdin: NodeJS.ReadStream;
    stdout: NodeJS.WriteStream;
  };
  exit: () => void;
}
const AppContext = createContext<AppContextType | undefined>(undefined);

export function useAppContext() {
  const app = useContext(AppContext);
  if (!app) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return app;
}

interface AppProviderProps {
  children: ReactNode;
  controller: AbortController;
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
}

export function AppProvider({
  controller,
  children,
  stdin,
  stdout,
}: AppProviderProps) {
  const exit = useCallback(() => {
    controller.abort();
  }, [controller]);

  return (
    <AppContext.Provider value={{ controller, io: { stdin, stdout }, exit }}>
      {children}
    </AppContext.Provider>
  );
}
