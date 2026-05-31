import { useCallback } from 'react';
import { type Suggestion } from './input-suggestion-provider';
import { useAbort, useAgent } from '../context';

export const SUPPORTED_COMMANDS = [
  { value: 'clear', description: 'Clears the context window' },
  { value: 'exit' },
  { value: 'quit' },
] as const satisfies Suggestion[];
type Command = (typeof SUPPORTED_COMMANDS)[number]['value'];

export function useCommandProcessor() {
  const { setMessages, setModelMessages } = useAgent();
  const controller = useAbort();

  const processCommand = useCallback(
    (command: string) => {
      switch (command as Command) {
        case 'clear': {
          setModelMessages([]);
          setMessages([]);
          break;
        }
        case 'exit':
        case 'quit': {
          controller.abort(0);
        }
      }
    },
    [controller, setMessages, setModelMessages]
  );

  return { processCommand };
}
