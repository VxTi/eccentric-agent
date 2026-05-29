import { type Output } from 'ai';
import { z } from 'zod';
import { ToolBase } from './common/tool-base';
import { readFile } from 'fs/promises';

export default class FindInFile extends ToolBase<Input, Output> {
  constructor() {
    super({
      internalName: 'find_in_file',
      name: 'Find in file',
      description:
        'Searches the contents of a single file for a substring or regular expression and returns each match' +
        ' with its line number, column, the matched text, and the full line of context. Use this tool when you' +
        ' already know which file to inspect (for example obtained via `find_file`) and need to locate specific' +
        ' symbols, identifiers, error strings, or text fragments inside it. Prefer this over reading the entire' +
        ' file when only specific occurrences are relevant. ONLY use this tool when the current context does not' +
        ' already contain the information being searched for.',
      inputSchema,
      outputSchema,
      mightRequireApproval: false,
    });
  }

  public override async handle(input: Input): Promise<Output> {
    const content = await readFile(input.filePath, 'utf-8');
    const lines = content.split(/\r?\n/);

    const flags = input.caseSensitive === false ? 'gi' : 'g';
    const regex = input.isRegex
      ? new RegExp(input.pattern, flags)
      : new RegExp(input.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

    const matches: z.infer<typeof matchSchema>[] = [];
    const limit = input.maxResults ?? Infinity;

    for (let i = 0; i < lines.length && matches.length < limit; i++) {
      const line = lines[i];
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(line)) !== null && matches.length < limit) {
        matches.push({
          line: i + 1,
          column: m.index + 1,
          match: m[0],
          lineContent: line,
        });
        if (m[0].length === 0) regex.lastIndex++;
      }
    }

    return { matches };
  }

  public override inputToString(input: Input): string {
    return `Looking for pattern \`${input.pattern}\` in \`${input.filePath}\``;
  }

  public override outputToString(output: Output): string {
    const { matches } = output;

    return `Found \`${matches.length === 0 ? 'no' : matches.length}\` matches.`;
  }
}

const inputSchema = z.object({
  filePath: z.string().describe('The absolute path of the file to search in'),
  pattern: z
    .string()
    .describe('The substring or regular expression pattern to search for within the file'),
  isRegex: z
    .boolean()
    .optional()
    .describe(
      'Whether to interpret `pattern` as a regular expression. Defaults to false (literal substring match).'
    ),
  caseSensitive: z
    .boolean()
    .optional()
    .describe('Whether the match should be case-sensitive. Defaults to true.'),
  maxResults: z
    .number()
    .optional()
    .describe('The maximum number of matches to return. When omitted, all matches are returned.'),
});

type Input = z.infer<typeof inputSchema>;

const matchSchema = z.object({
  line: z.number().describe('The 1-based line number where the match occurred'),
  column: z.number().describe('The 1-based column at which the match starts on the line'),
  match: z.string().describe('The exact text that matched the pattern'),
  lineContent: z.string().describe('The full content of the line containing the match'),
});

const outputSchema = z.object({
  matches: z
    .array(matchSchema)
    .describe('All locations within the file where the pattern was found'),
});

type Output = z.infer<typeof outputSchema>;
