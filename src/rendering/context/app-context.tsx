import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../lib/state';
import { exit as exitAction } from '../../lib/state/app';

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
