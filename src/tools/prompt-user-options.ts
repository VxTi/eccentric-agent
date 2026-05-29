import { z } from 'zod';
import { type AgentContext } from '../rendering/context/agent-context';
import { ToolBase } from './common/tool-base';

export default class PromptUserOptionsTool extends ToolBase<Input, Output> {
  constructor() {
    super({
      internalName: 'prompt_user_options',
      name: 'Prompt user options',
      description:
        'Asks the user to disambiguate by picking one of several proposed options. Use this tool when' +
        ' you cannot proceed with confidence — the request is ambiguous, you can see multiple equally' +
        ' reasonable interpretations, or a decision is required that you should not make on the' +
        " user's behalf. Provide a short, specific `question` and 2–6 mutually exclusive `options`," +
        ' each with a stable `id` (used by you to read the answer) and a human-readable `label`' +
        ' (shown to the user). The tool blocks until the user picks one, then returns the chosen' +
        ' `id` and `label`.\n\n' +
        'Do NOT use this tool for trivial choices you can resolve from context, for confirmation of' +
        ' an already-clear plan, or as a substitute for thinking. Prefer making a reasonable choice' +
        ' and stating your assumption when the question would be pedantic.',
      inputSchema,
      outputSchema,
      mightRequireApproval: false,
    });
  }

  public override async handle(
    input: Input,
    context: AgentContext
  ): Promise<Output> {
    const ids = new Set<string>();
    for (const option of input.options) {
      if (ids.has(option.id)) {
        throw new Error(
          `Duplicate option id "${option.id}". Each option must have a unique id.`
        );
      }
      ids.add(option.id);
    }

    const chosen = await context.inputQueue.request({
      toolName: this.internalName,
      prompt: input.question,
      options: input.options.map(option => ({
        option: option.id,
        text: option.label,
      })),
    });

    const match = input.options.find(option => option.id === chosen);
    if (!match) {
      throw new Error(
        `User selected an unrecognised option id "${chosen}". Expected one of:` +
          ` ${input.options.map(option => option.id).join(', ')}.`
      );
    }

    return { selectedId: match.id, selectedLabel: match.label };
  }

  public override inputToString(input: Input): string {
    return `Asking user: ${input.question}`;
  }

  public override outputToString(output: Output): string {
    return `User selected: ${output.selectedLabel}`;
  }
}

const optionSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      'Stable, short identifier for this option (e.g. `overwrite`, `create_new`). Returned to you' +
        ' verbatim when the user picks this option, so use it as the key to branch on.'
    ),
  label: z
    .string()
    .min(1)
    .describe(
      'Human-readable label shown to the user for this option. Keep it short and unambiguous.'
    ),
});

const inputSchema = z.object({
  question: z
    .string()
    .min(1)
    .describe(
      'The question to show the user. Be specific about what is ambiguous and why a decision is' +
        ' needed.'
    ),
  options: z
    .array(optionSchema)
    .min(2)
    .max(6)
    .describe(
      'Between 2 and 6 mutually exclusive options for the user to choose from. Each must have a' +
        ' unique `id`.'
    ),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  selectedId: z.string().describe('The `id` of the option the user selected.'),
  selectedLabel: z
    .string()
    .describe('The `label` of the option the user selected.'),
});

type Output = z.infer<typeof outputSchema>;
