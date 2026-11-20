import { isNil } from '@vxti/typed';
import { ReasoningEffort } from './agent/agent';
import { TokenSource } from './events/events';
import { emitMessage } from './events/messaging';
import { emitConsumeTokenEvent } from './events/token-usage';
import { requestUserInput } from './events/user-input';
import type { Suggestion } from './input-suggestions';
import { app, clearMessages, store } from './state';
import { ellipsize, Position } from './utils/string-utils';

const SUPPORTED_COMMANDS = [
  { value: 'clear', description: 'Clears the context window' },
  { value: 'effort', description: 'Cycles the reasoning effort level' },
  { value: 'exit' },
  { value: 'quit' },
  { value: 'halt', description: 'Halts the agent of its activity' },
  { value: 'system-prompt', description: 'Prints the current system prompt' },
] as const satisfies Suggestion[];
export type Command = (typeof SUPPORTED_COMMANDS)[number]['value'];

export function isCommand(input: string): input is Command {
  return SUPPORTED_COMMANDS.findIndex(cmd => cmd.value === input) > -1;
}

export function getCommandSuggestions(): Suggestion[] {
  return [
    ...SUPPORTED_COMMANDS,
    ...store.getState().agent.agent.skills.map(s => ({
      value: s.name,
      description: ellipsize(s.description, 100, Position.END),
    })),
  ];
}

export function processCommand(command: string) {
  const commands = getCommandSuggestions();
  if (!commands.some(c => c.value === command)) {
    return;
  }

  const dispatch = store.dispatch;
  const agent = store.getState().agent.agent;

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
    case 'effort': {
      const EFFORT_LEVELS = Object.values(ReasoningEffort);

      void requestUserInput({
        title: 'Reasoning effort',
        description:
          'Select the reasoning effort level to use for subsequent requests.',
        options: EFFORT_LEVELS.map(level => ({
          label: level === agent.reasoningEffort ? `${level} (current)` : level,
          value: level,
        })),
      }).then(([chosen]) => {
        if (isNil(chosen)) return;

        agent.reasoningEffort = chosen.value;
        emitMessage({
          type: 'generic',
          content: `Reasoning effort set to \`${chosen.value}\``,
        });
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
}
