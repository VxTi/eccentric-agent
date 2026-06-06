import { useCallback } from 'react';
import { isCommand } from '../../lib/commands';
import { emitMessage } from '../../lib/events/messaging';
import { emitConsumeTokenEvent } from '../../lib/events/token-usage';
import { TokenSource } from '../../lib/events/events';
import { appController } from '../../signal';
import { useAgent } from '../context';

export function useCommandProcessor() {
  const { setMessages, setModelMessages, systemPrompt } = useAgent();

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
          appController.abort(0);
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
    [setMessages, setModelMessages, systemPrompt]
  );

  return { processCommand };
}
