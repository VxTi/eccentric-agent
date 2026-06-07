import * as z from 'zod';
import { Result } from '../../../result';
import { createTool } from '../common';
import { readFile } from 'fs/promises';

const inputSchema = z.object({
  filePath: z.string().describe('The absolute path of the file to search in'),
  pattern: z
    .string()
    .describe(
      'The substring or regular expression pattern to search for within the file'
    ),
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
    .describe(
      'The maximum number of matches to return. When omitted, all matches are returned.'
    ),
});

const matchSchema = z.object({
  line: z.number().describe('The 1-based line number where the match occurred'),
  column: z
    .number()
    .describe('The 1-based column at which the match starts on the line'),
  match: z.string().describe('The exact text that matched the pattern'),
  lineContent: z
    .string()
    .describe('The full content of the line containing the match'),
});
type Match = z.infer<typeof matchSchema>;

const outputSchema = z.object({
  matches: z
    .array(matchSchema)
    .describe('All locations within the file where the pattern was found'),
});

export default createTool({
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

  async handle({ filePath, caseSensitive, isRegex, maxResults, pattern }) {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);

    const flags = caseSensitive === false ? 'gi' : 'g';
    const regex = isRegex
      ? new RegExp(pattern, flags)
      : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

    const matches: Match[] = [];
    const limit = maxResults ?? Infinity;

    for (let i = 0; i < lines.length && matches.length < limit; i++) {
      const line = lines[i] ?? '';
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

    return Result.Ok({ matches });
  },

  inputToString({ pattern, filePath }) {
    return `Looking for pattern \`${pattern}\` in \`${filePath}\``;
  },

  outputToString({ matches }): string {
    return `Found \`${matches.length === 0 ? 'no' : matches.length}\` matches.`;
  },
});
