import { isNil } from '@vxti/typed';
import { useCallback } from 'react';
import { getCommandSuggestions } from '../../lib/commands';
import { emitMessage } from '../../lib/events/messaging';
import { emitConsumeTokenEvent } from '../../lib/events/token-usage';
import { TokenSource } from '../../lib/events/events';
import { app, setActiveSkill, store, useAppDispatch } from '../../lib/state';
import { useAgent } from '../context';

export function useCommandProcessor() {
  const { setMessages, setModelMessages, systemPrompt } = useAgent();
  const dispatch = useAppDispatch();

  const processCommand = useCallback(
    (command: string) => {
      const commands = getCommandSuggestions();

      if (!commands.some(c => c.value === command)) {
        console.log(command, commands);
        return;
      }

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
            type: 'generic',
            content: `Here is the system prompt:

${systemPrompt}`,
          });
          break;
        default:
          const skill = store
            .getState()
            .agent.skills.find(s => s.name === command);
          if (isNil(skill)) {
            emitMessage({
              type: 'assistant',
              content: `Unable to load skill \`${command}\``,
            });
            return;
          }
          emitMessage({
            type: 'assistant',
            content: `Using skill \`${command}\``,
          });
          dispatch(setActiveSkill(skill));
      }
    },
    [dispatch, setMessages, setModelMessages, systemPrompt]
  );

  return { processCommand };
}
