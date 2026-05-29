import { z } from 'zod';
import { ToolBase } from './common/tool-base';

export default class GetUserTimeTool extends ToolBase<Input, Output> {
  constructor() {
    super(
      'get_user_time',
      'Get user time',
      "Returns the user's current local date and time as a human-readable string, along with the" +
        ' resolved IANA time zone and the raw ISO 8601 timestamp. Use this tool when you need to know' +
        " *when* it is for the user — for example to answer 'what time is it?', to timestamp output," +
        ' or to reason about deadlines relative to "now". Takes no arguments.',
      inputSchema,
      outputSchema
    );
  }

  public override async handle(): Promise<Output> {
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
  }

  public override inputToString(_input: Input): string {
    return 'Getting current user time';
  }

  public override outputToString(output: Output): string {
    return `Current user time: ${output.formatted}`;
  }
}

const inputSchema = z.object({});

type Input = z.infer<typeof inputSchema>;

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

type Output = z.infer<typeof outputSchema>;
