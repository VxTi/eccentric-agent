import type { Suggestion } from '../rendering/hooks';

export const SUPPORTED_COMMANDS = [
  { value: 'clear', description: 'Clears the context window' },
  { value: 'exit' },
  { value: 'quit' },
  { value: 'halt', description: 'Halts the agent of its activity' },
  { value: 'system-prompt', description: 'Prints the current system prompt' },
] as const satisfies Suggestion[];
export type Command = (typeof SUPPORTED_COMMANDS)[number]['value'];

export function isCommand(input: string): input is Command {
  return SUPPORTED_COMMANDS.findIndex(cmd => cmd.value === input) > -1;
}
