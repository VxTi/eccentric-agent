import { useCallback } from 'react';
import { type Suggestion } from './input-suggestion-provider';
import { useAgent } from '../context';

export const SUPPORTED_COMMANDS = [
  { value: 'clear', description: 'Clears the context window' },
  { value: '' },
] as const satisfies Suggestion[];

export function useCommandProcessor() {
  const { setMessages, setModelMessages } = useAgent();

  const processCommand = useCallback(
    (command: string) => {
      switch (command) {
        case 'clear': {
          setModelMessages([]);
          setMessages([]);
        }
      }
    },
    [setMessages, setModelMessages]
  );

  return { processCommand };
}
