import { useCallback } from 'react';
import { isCommand } from '../../lib/commands';
import { useAbort, useAgent } from '../context';

export function useCommandProcessor() {
  const { setMessages, setModelMessages } = useAgent();
  const controller = useAbort();

  const processCommand = useCallback(
    (command: string) => {
      if (!isCommand(command)) return;

      switch (command) {
        case 'clear': {
          setModelMessages([]);
          setMessages([]);
          break;
        }
        case 'exit':
        case 'quit': {
          controller.abort(0);
          break;
        }
      }
    },
    [controller, setMessages, setModelMessages]
  );

  return { processCommand };
}
