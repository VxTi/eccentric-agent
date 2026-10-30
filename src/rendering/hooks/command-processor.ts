import { useCallback } from 'react';
import { isCommand } from '../../lib/commands';
import { emitMessage } from '../../lib/events/messaging';
import { emitConsumeTokenEvent } from '../../lib/events/token-usage';
import { TokenSource } from '../../lib/events/events';
import { app, useAppDispatch } from '../../lib/state';
import { useAgent } from '../context';

export function useCommandProcessor() {
  const { setMessages, setModelMessages, systemPrompt } = useAgent();
  const dispatch = useAppDispatch();

  const processCommand = useCallback(
    (command: string) => {
      if (!isCommand(command)) return;

      switch (command) {
        case 'clear': {
          setModelMessages([]);
          setMessages([]);
          emitConsumeTokenEvent({
            input: 0,
            output: 0,
            reset: true,
            source: TokenSource.PRIMARY,
          });
          break;
        }
        case 'exit':
        case 'quit': {
          dispatch(app.exit());
          break;
        }
        case 'system-prompt':
          emitMessage({
            type: 'user',
            content: `Here is the system prompt:

${systemPrompt}`,
          });
          break;
      }
    },
    [dispatch, setMessages, setModelMessages, systemPrompt]
  );

  return { processCommand };
}
