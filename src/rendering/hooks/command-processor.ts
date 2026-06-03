import { useCallback } from 'react';
import { isCommand } from '../../lib/commands';
import { emitConsumeTokenEvent } from '../../lib/events/emission';
import { TokenSource } from '../../lib/events/events';
import { emitMessage } from '../../lib/events/user-input';
import { useAbort, useAgent } from '../context';

export function useCommandProcessor() {
  const { setMessages, setModelMessages, systemPrompt } = useAgent();
  const controller = useAbort();

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
          controller.abort(0);
          break;
        }
        case 'system-prompt':
          emitMessage({
            type: 'assistant',
            content: `Here is the system prompt:

${systemPrompt}`,
          });

          break;
      }
    },
    [controller, setMessages, setModelMessages, systemPrompt]
  );

  return { processCommand };
}
