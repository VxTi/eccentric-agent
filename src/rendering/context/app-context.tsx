import { type ReactNode, useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../lib/state/store';
import { setController, setIO, exit as exitAction } from '../../lib/state/app';

export interface AppContextType {
  controller: AbortController;
  io: {
    stdin: NodeJS.ReadStream;
    stdout: NodeJS.WriteStream;
  };
  exit: () => void;
}

export function useAppContext(): AppContextType {
  const dispatch = useAppDispatch();
  const { controller, io } = useAppSelector(state => state.app);

  const exit = useCallback(() => {
    dispatch(exitAction());
  }, [dispatch]);

  return {
    controller,
    io,
    exit,
  };
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
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(setController(controller));
    dispatch(setIO({ stdin, stdout }));
  }, [controller, stdin, stdout, dispatch]);

  return <>{children}</>;
}
