import { isNil } from '@vxti/typed';
import { ReasoningEffort } from './agent/agent';
import { MODEL_CATALOG } from './agent/inference';
import { SkillInclusion } from './agent/skills/model';
import { emitMessage } from './events/messaging';
import {
  emitResponseTokensEvent,
  emitContextUsageEvent,
} from './events/token-usage';
import { requestUserInput } from './events/user-input';
import type { Suggestion } from './input-suggestions';
import { app, clearMessages, store } from './state';
import { MessageType } from './types/messages';
import { ellipsize, Position } from './utils/string-utils';

const SUPPORTED_COMMANDS = [
  { value: 'clear', description: 'Clears the context window' },
  { value: 'effort', description: 'Cycles the reasoning effort level' },
  { value: 'exit' },
  { value: 'quit' },
  { value: 'halt', description: 'Halts the agent of its activity' },
  { value: 'model', description: 'Selects the model used for inference' },
  { value: 'system-prompt', description: 'Prints the current system prompt' },
] as const satisfies Suggestion[];
export type Command = (typeof SUPPORTED_COMMANDS)[number]['value'];

export function isCommand(input: string): input is Command {
  return SUPPORTED_COMMANDS.findIndex(cmd => cmd.value === input) > -1;
}

export function getCommandSuggestions(): Suggestion[] {
  return [
    ...SUPPORTED_COMMANDS,
    ...store.getState().agent.agent.skills.map(
      (s): Suggestion => ({
        value: s.name,
        ...(s.inclusion === SkillInclusion.ALWAYS
          ? {
              disabled: true,
              disabledReason: 'This skill is always enabled',
            }
          : {}),
        description: ellipsize(s.description, 100, Position.END),
      })
    ),
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
      emitResponseTokensEvent({ output: 0, reset: true });
      emitContextUsageEvent({ input: 0, output: 0 });
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
        cancellable: true,
      }).then(([result]) => {
        if (isNil(result)) return;

        if (result.cancelled) {
          return;
        }

        agent.reasoningEffort = result.value;
        emitMessage({
          type: MessageType.GENERIC,
          content: `Reasoning effort set to \`${result.value}\``,
        });
      });
      break;
    }
    case 'model': {
      void requestUserInput({
        title: 'Model',
        description: 'Select the model to use for subsequent requests.',
        options: MODEL_CATALOG.map(model => ({
          label:
            model.id === agent.model.id
              ? `${model.label} (current)`
              : model.label,
          value: model,
        })),
        cancellable: true,
      }).then(([result]) => {
        if (isNil(result)) return;

        if (result.cancelled) {
          return;
        }
        agent.model = result.value;
        emitMessage({
          type: MessageType.GENERIC,
          content: `Model set to \`${result.value.id}\``,
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
      emitMessage({
        type: MessageType.GENERIC,
        content: `Here is the system prompt:\n\n${agent.systemPrompt}`,
      });
      break;
    default: {
      const skill = agent.skills.find(
        s => s.name === command && s.inclusion !== SkillInclusion.ALWAYS
      );

      if (isNil(skill)) {
        emitMessage({
          type: MessageType.ASSISTANT,
          content: `Unable to load skill \`${command}\``,
        });
        return;
      }
      emitMessage({
        type: MessageType.ASSISTANT,
        content: `Using skill \`${command}\``,
      });
      agent.activateSkill(skill);
    }
  }
}
