import { isNil } from '@vxti/typed';
import { useCallback } from 'react';
import { getCommandSuggestions } from '../../lib/commands';
import { emitMessage } from '../../lib/events/messaging';
import { emitConsumeTokenEvent } from '../../lib/events/token-usage';
import { TokenSource } from '../../lib/events/events';
import { app, clearMessages, useAppDispatch } from '../../lib/state';
import { useAgent } from '../hooks/use-agent';

export function useCommandProcessor() {
  const { agent } = useAgent();
  const dispatch = useAppDispatch();

  const processCommand = useCallback(
    (command: string) => {
      const commands = getCommandSuggestions();

      if (!commands.some(c => c.value === command)) {
        return;
      }

      switch (command) {
        case 'clear': {
          agent.clear();
          dispatch(clearMessages());
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
          void agent
            .buildSystemPrompt()
            .then(systemPrompt =>
              emitMessage({
                type: 'generic',
                content: `Here is the system prompt:\n\n${systemPrompt}`,
              })
            )
            .catch(() => {
              emitMessage({
                type: 'generic',
                content: `Something went wrong whilst creating the system prompt`,
              });
            });
          break;
        default: {
          const skill = agent.skills.find(s => s.name === command);
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
          agent.activateSkill(skill);
        }
      }
    },
    [agent, dispatch]
  );

  return { processCommand };
}
