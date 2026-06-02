import { useCallback } from 'react';
import { isCommand } from '../../lib/commands';
import { emitAgentMessage } from '../../lib/events/user-input';
import { useAbort, useAgent } from '../context';
import { v7 as uuid } from 'uuid';

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
          break;
        }
        case 'exit':
        case 'quit': {
          controller.abort(0);
          break;
        }
        case 'system-prompt':
          emitAgentMessage({
            type: 'assistant',
            id: uuid(),
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
