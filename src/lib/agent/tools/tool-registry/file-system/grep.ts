import * as path from 'node:path';
import * as fs from 'node:fs';
import * as z from 'zod';
import { Result } from '../../../../result';
import { createTool } from '../../tool-definition';
import { store } from '../../../../state';

const DEFAULT_FILE_PATTERN = '**/*';
const DEFAULT_IGNORED_DIRS = ['node_modules', '.git'];
const MAX_SHOWN_MATCHES = 10;

const inputSchema = z.object({
  directoryPath: z
    .string()
    .describe('The directory path under which to search file contents'),
  pattern: z
    .string()
    .describe(
      'The substring or regular expression pattern to search for within file contents'
    ),
  filePattern: z
    .string()
    .optional()
    .describe(
      'An optional glob pattern (relative to `directoryPath`) restricting which files are searched, using' +
        ' glob syntax: `**/` for recursive descent, `*` for wildcard, `{a,b,c}` for alternatives. Examples:' +
        ' `**/*.{ts,tsx}` (TypeScript files anywhere), `src/**/*.test.ts` (test files under src). Defaults to' +
        ' `**/*` (every file in the tree).'
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
      'The maximum number of matches to return across all files. When omitted, all matches are returned.'
    ),
});

const matchSchema = z.object({
  filePath: z
    .string()
    .describe('The absolute path of the file containing the match'),
  line: z.number().describe('The 1-based line number where the match occurred'),
  column: z
    .number()
    .describe('The 1-based column at which the match starts on the line'),
  match: z.string().describe('The exact text that matched the pattern'),
  lineContent: z
    .string()
    .describe('The full content of the line containing the match'),
});
type GrepMatch = z.infer<typeof matchSchema>;

const outputSchema = z.object({
  matches: z
    .array(matchSchema)
    .describe(
      'All locations across the searched files where the pattern was found'
    ),
});

function isIgnored(relativePath: string): boolean {
  const segments = relativePath.split(path.sep);
  return segments.some(segment => DEFAULT_IGNORED_DIRS.includes(segment));
}

export const grep = createTool({
  internalName: 'grep',
  name: 'Grep',
  description:
    'Searches the contents of files under a directory for a substring or regular expression and returns each' +
    ' match with its file path, line number, column, the matched text, and the full line of context. This is' +
    ' the preferred tool for searching across many files by content — PREFER IT over invoking `Shell` with' +
    ' `grep`, `rg`, or similar commands, which require approval and are less structured. Use `find_file` when' +
    ' you need to locate files by name rather than by content, and `find_in_file` when you already know the' +
    ' single file to inspect. Restrict the search with `filePattern` (a glob) when only certain files are' +
    ' relevant. ONLY use this tool when the current context does not already contain the information being' +
    ' searched for. `node_modules` and `.git` directories are skipped automatically.',
  inputSchema,
  outputSchema,

  async handle(
    { directoryPath, pattern, filePattern, isRegex, caseSensitive, maxResults },
    _channel,
    signal
  ) {
    const cwd = path.resolve(process.cwd(), directoryPath);

    const flags = caseSensitive === false ? 'gi' : 'g';
    const regex = isRegex
      ? new RegExp(pattern, flags)
      : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

    const limit = maxResults ?? Infinity;
    const matches: GrepMatch[] = [];

    const files = fs.promises.glob(filePattern ?? DEFAULT_FILE_PATTERN, {
      cwd,
    });

    for await (const relativePath of files) {
      if (signal.aborted) break;
      if (matches.length >= limit) break;
      if (isIgnored(relativePath)) continue;

      const absolutePath = path.resolve(cwd, relativePath);

      let stats: fs.Stats;
      try {
        stats = await fs.promises.stat(absolutePath);
      } catch {
        continue;
      }
      if (!stats.isFile()) continue;

      let content: string;
      try {
        content = await fs.promises.readFile(absolutePath, 'utf-8');
      } catch {
        // Unreadable or binary file — skip rather than fail the whole search.
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length && matches.length < limit; i++) {
        const line = lines[i] ?? '';
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(line)) !== null && matches.length < limit) {
          matches.push({
            filePath: absolutePath,
            line: i + 1,
            column: m.index + 1,
            match: m[0],
            lineContent: line,
          });
          if (m[0].length === 0) regex.lastIndex++;
        }
      }
    }

    return Result.Ok({ matches }, { pattern });
  },

  inputToString({ pattern, directoryPath }) {
    return `Searching for pattern \`${pattern}\` in \`${directoryPath}\``;
  },

  outputToString({ matches }, _, { pattern }): string {
    if (matches.length === 0) {
      return `Found no matches for pattern \`${pattern}\`.`;
    }

    const limitVisible = matches.length > MAX_SHOWN_MATCHES;
    const shown = limitVisible ? matches.slice(0, MAX_SHOWN_MATCHES) : matches;
    const cwd = store.getState().fileSystem.cwd;

    const formatted = shown
      .map(
        m =>
          `${path.relative(cwd, m.filePath)}:\`${m.line}\`: ${m.lineContent.trim()}`
      )
      .join('\n');

    return `Found ${matches.length} match${matches.length === 1 ? '' : 'es'} for pattern \`${pattern}\`:\n\n${formatted}\n${
      limitVisible ? `\n... and ${matches.length - MAX_SHOWN_MATCHES} more` : ''
    }`;
  },
});
