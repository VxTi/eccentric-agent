import * as z from 'zod';
import { createTool } from './common';

const inputSchema = z.object();
const outputSchema = z.object({
  formatted: z
    .string()
    .describe("The user's current local date and time, human-readable."),
  timeZone: z
    .string()
    .describe(
      'The resolved IANA time zone identifier (e.g. `Europe/Amsterdam`).'
    ),
  iso: z
    .string()
    .describe('The current instant as an ISO 8601 timestamp (UTC).'),
});

export default createTool({
  internalName: 'get_user_time',
  name: 'Get user time',
  description:
    "Returns the user's current local date and time as a human-readable string, along with the" +
    ' resolved IANA time zone and the raw ISO 8601 timestamp. Use this tool when you need to know' +
    " *when* it is for the user — for example to answer 'what time is it?', to timestamp output," +
    ' or to reason about deadlines relative to "now". Takes no arguments.',
  inputSchema,
  outputSchema,
  mightRequireApproval: false,

  async handle() {
    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const formatted = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone,
    }).format(now);

    return Promise.resolve({
      formatted,
      timeZone,
      iso: now.toISOString(),
    });
  },

  inputToString(): string {
    return 'Getting current user time';
  },

  outputToString(output): string {
    return `Current user time: ${output.formatted}`;
  },
});
