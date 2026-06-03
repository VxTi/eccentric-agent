import * as z from 'zod';
import { requestUserInput } from '../lib/events/user-input';
import { createTool } from './common';

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
    .max(9)
    .describe(
      'Between 2 and 9 mutually exclusive options for the user to choose from. Each must have a' +
        ' unique `id`. Always include a catch-all option (e.g. `other` / `something_else`) so the' +
        ' user can escape if none of your proposed options fit.'
    ),
  selectMultiple: z
    .boolean()
    .describe(
      'Whether the selection of multiple options is required. By default, this is not the case'
    )
    .optional()
    .default(false),
});

const outputSchema = z.object({
  selectedOptions: z.array(
    z.object({
      selectedId: z.string(),
      selectedLabel: z.string(),
    })
  ),
});

export default createTool({
  internalName: 'prompt_user_options',
  name: 'Prompt user options',
  description:
    'THE ONLY way to ask the user a question. You MUST use this tool ANY time you need input,' +
    ' clarification, confirmation, or a decision from the user — never ask questions in plain' +
    ' assistant text. If your next message would contain a question mark directed at the user,' +
    ' stop and call this tool instead.\n\n' +
    'This includes: disambiguating an unclear request, choosing between multiple reasonable' +
    ' interpretations, confirming a destructive or irreversible action, picking a file/path/name,' +
    ' selecting a library or approach, resolving conflicts, or any other decision that should not' +
    " be made on the user's behalf.\n\n" +
    'Provide a short, specific `question` and 2–9 mutually exclusive `options`, each with a' +
    ' stable `id` (used by you to read the answer) and a human-readable `label` (shown to the' +
    ' user). Always include a catch-all option (e.g. `other`) so the user is never boxed in. The' +
    ' tool blocks until the user picks one, then returns the chosen `id` and `label`.\n\n' +
    'The ONLY exception: do not use this tool for questions you can answer yourself from context,' +
    ' the codebase, or sensible defaults. Prefer making a reasonable choice and stating your' +
    ' assumption when the question would be pedantic. But once you have decided a question is' +
    ' genuinely needed, it MUST go through this tool — no exceptions.',
  inputSchema,
  outputSchema,

  async handle({ options, question, selectMultiple }) {
    const ids = new Set<string>();
    for (const option of options) {
      if (ids.has(option.id)) {
        throw new Error(
          `Duplicate option id "${option.id}". Each option must have a unique id.`
        );
      }
      ids.add(option.id);
    }

    const chosen = await requestUserInput({
      title: 'Your attention is needed',
      description: question,
      options,
      allowMultiple: selectMultiple,
    });

    if (chosen.length === 0) {
      throw new Error(
        `User selected an unrecognised option(s) id "${chosen.map(({ id }) => id).join(', ')}". Expected one of:` +
          ` ${options.map(option => option.id).join(', ')}.`
      );
    }

    return {
      selectedOptions: chosen.map(match => ({
        selectedId: match.id,
        selectedLabel: match.label,
      })),
    };
  },

  inputToString({ question }) {
    return `Asking user: ${question}`;
  },

  outputToString({ selectedOptions }) {
    const selected = selectedOptions
      .map(opt => `${opt.selectedLabel}`)
      .join(', ');

    return `User selected: ${selected}`;
  },
});
