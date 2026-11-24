import * as path from 'node:path';
import * as fs from 'node:fs';
import * as z from 'zod';
import { Result } from '../../../../result';
import { createTool } from '../../tool-definition';
import { store } from '../../../../state';

const DEFAULT_FILE_PATTERN = '**/*';
const DEFAULT_IGNORED_DIRS = ['node_modules', '.git'];
const MAX_SHOWN_MATCHES = 10;
const DEFAULT_MAX_RESULTS = 200;
const MAX_MATCHES_PER_FILE = 20;
const MAX_LINE_DISPLAY_LENGTH = 250;

const inputSchema = z.object({
  directoryPath: z
    .string()
    .describe('The directory path under which to search file contents'),
  pattern: z
    .string()
    .describe(
      'The JavaScript regular expression (or, with `isRegex: false`, literal substring) to search for' +
        ' within file contents'
    ),
  filePattern: z
    .string()
    .optional()
    .describe(
      'An optional glob pattern (relative to `directoryPath`) restricting which files are searched, using' +
        ' glob syntax: `**/` for recursive descent, `*` for wildcard, `{a,b,c}` for alternatives. A pattern' +
        ' without `/` matches file names at any depth, so `*.{ts,tsx}` means TypeScript files anywhere;' +
        ' `src/**/*.test.ts` means test files under src. Defaults to every file in the tree.'
    ),
  outputMode: z
    .enum(['content', 'files_with_matches'])
    .optional()
    .describe(
      '`content` returns each matching line with its file path, line number, and content.' +
        ' `files_with_matches` returns only the paths of files containing at least one match — much cheaper' +
        ' for broad or vague patterns; follow up with `find_in_file` on the promising files.' +
        ' Defaults to `content`.'
    ),
  isRegex: z
    .boolean()
    .optional()
    .describe(
      'Whether to interpret `pattern` as a regular expression. Defaults to true, like `grep -E` / `rg`.' +
        ' Set to false to match `pattern` as a literal substring (no escaping needed).'
    ),
  caseSensitive: z
    .boolean()
    .optional()
    .describe('Whether the match should be case-sensitive. Defaults to true.'),
  maxResults: z
    .number()
    .optional()
    .describe(
      'The maximum number of matches (or files, with `outputMode: files_with_matches`) to return.' +
        ' Defaults to 200; results are marked as truncated when the cap is hit. For broad patterns,' +
        ' pass a smaller limit.'
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
      'Matching lines with their locations; capped by `maxResults` and a per-file limit, in which case' +
        ' metadata reports `truncated: true`'
    ),
  files: z
    .array(z.string())
    .describe(
      'Absolute paths of files containing at least one match (only populated with' +
        ' `outputMode: files_with_matches`)'
    ),
});

export const grep = createTool({
  internalName: 'grep',
  name: 'Grep',
  description:
    'Searches the contents of files under a directory for a regular expression (or literal substring with' +
    ' `isRegex: false`) and returns matching lines with their file path, line number, column, matched text,' +
    ' and line content — or, with `outputMode: files_with_matches`, just the paths of matching files. This' +
    ' is the preferred tool for searching across many files by content — PREFER IT over invoking `Shell`' +
    ' with `grep`, `rg`, or similar commands, which require approval and are less structured. Use `find_file`' +
    ' when you need to locate files by name rather than by content, and `find_in_file` when you already know' +
    ' the single file to inspect. For broad or vague patterns, pass `maxResults` or use' +
    ' `outputMode: files_with_matches` — unrestricted searches on common terms produce very large result' +
    ' sets. Restrict the search with `filePattern` (a glob) when only certain files are relevant. ONLY use' +
    ' this tool when the current context does not already contain the information being searched for.' +
    ' `node_modules` and `.git` directories are skipped automatically.',
  inputSchema,
  outputSchema,

  handle(input, _channel, signal) {
    return handleGrep(input, signal);
  },

  inputToString({ pattern, directoryPath }) {
    return `Searching for pattern \`${pattern}\` in \`${directoryPath}\``;
  },

  outputToString({ matches, files }, _, { pattern, truncated }): string {
    if (files.length > 0) {
      return formatMatchingFiles(files, pattern, truncated);
    }

    if (matches.length === 0) {
      return `Found no matches for pattern \`${pattern}\`.`;
    }

    const limitVisible = matches.length > MAX_SHOWN_MATCHES;
    const shown = limitVisible ? matches.slice(0, MAX_SHOWN_MATCHES) : matches;
    const formatted = shown
      .map(
        m =>
          `${relativeToCwd(m.filePath)}:${m.line}: ${truncateLine(m.lineContent)}`
      )
      .join('\n');
    const fileCount = new Set(matches.map(m => m.filePath)).size;

    const truncationNotice = truncated
      ? '\n\nResults were truncated. Narrow the search with `filePattern`, raise `maxResults`, or use' +
        ' `outputMode: files_with_matches` for broad patterns.'
      : '';

    return (
      `Found ${matches.length} match${matches.length === 1 ? '' : 'es'} for pattern \`${pattern}\`` +
      ` across ${fileCount} file${fileCount === 1 ? '' : 's'}:\n\n${formatted}\n${
        limitVisible
          ? `\n... and ${matches.length - MAX_SHOWN_MATCHES} more`
          : ''
      }${truncationNotice}`
    );
  },
});

async function handleGrep(
  params: z.infer<typeof inputSchema>,
  signal: AbortSignal
): Promise<
  Result<
    z.infer<typeof outputSchema>,
    string,
    { pattern: string; truncated: boolean }
  >
> {
  const {
    directoryPath,
    pattern,
    filePattern,
    isRegex,
    caseSensitive,
    maxResults,
    outputMode,
  } = params;
  const cwd = path.resolve(process.cwd(), directoryPath);
  const limit = maxResults ?? DEFAULT_MAX_RESULTS;
  const listMatchingFiles = outputMode === 'files_with_matches';

  let regex: RegExp;
  try {
    regex = compileRegex(pattern, isRegex, caseSensitive);
  } catch (error) {
    return Result.Error(
      `${String(error)}. Escape the special characters, or pass \`isRegex: false\` to search for` +
        ' the pattern as a literal substring.'
    );
  }

  const result = await searchFiles(regex, filePattern, {
    cwd,
    limit,
    listMatchingFiles,
    signal,
  });
  return Result.Ok(toToolOutput(result, listMatchingFiles), {
    pattern,
    truncated: result.truncated,
  });
}

function isIgnored(entryPath: string): boolean {
  return DEFAULT_IGNORED_DIRS.includes(path.basename(entryPath));
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mirrors `rg -g` / `grep --include`: a pattern naming no directory matches
 * file names at any depth instead of only at the search root.
 */
function toRecursiveGlob(filePattern: string): string {
  return filePattern.includes('/') ? filePattern : `**/${filePattern}`;
}

function truncateLine(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length <= MAX_LINE_DISPLAY_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_LINE_DISPLAY_LENGTH)}…`;
}

function relativeToCwd(absolutePath: string): string {
  return path.relative(store.getState().fileSystem.cwd, absolutePath);
}

function formatMatchingFiles(
  files: string[],
  pattern: string,
  truncated: boolean
): string {
  const shown = files.slice(0, MAX_SHOWN_MATCHES);
  const formatted = shown.map(relativeToCwd).join('\n');
  const more =
    files.length > shown.length
      ? `\n... and ${files.length - shown.length} more`
      : '';
  const truncationNotice = truncated
    ? '\n\nResult limit reached — the list may be incomplete. Narrow the search with `filePattern` or' +
      ' raise `maxResults`.'
    : '';
  return (
    `Found ${files.length} file${files.length === 1 ? '' : 's'} matching pattern \`${pattern}\`:\n` +
    `${formatted}${more}${truncationNotice}`
  );
}

interface SearchOptions {
  cwd: string;
  limit: number;
  listMatchingFiles: boolean;
  signal: AbortSignal;
}

interface SearchState {
  matches: GrepMatch[];
  files: Set<string>;
  limit: number;
  listMatchingFiles: boolean;
  collected(): number;
}

interface GrepSearchResult {
  matches: GrepMatch[];
  files: string[];
  truncated: boolean;
}

function compileRegex(
  pattern: string,
  isRegex: boolean | undefined,
  caseSensitive: boolean | undefined
): RegExp {
  const source = isRegex === false ? escapeRegex(pattern) : pattern;
  const flags = caseSensitive === false ? 'gi' : 'g';
  return new RegExp(source, flags);
}

function listCandidateFiles(
  cwd: string,
  filePattern: string | undefined
): AsyncIterable<string> {
  return fs.promises.glob(
    filePattern !== undefined
      ? toRecursiveGlob(filePattern)
      : DEFAULT_FILE_PATTERN,
    { cwd, exclude: isIgnored }
  );
}

async function readFileOrSkip(absolutePath: string): Promise<string | null> {
  try {
    const stats = await fs.promises.stat(absolutePath);
    if (!stats.isFile()) return null;
    return await fs.promises.readFile(absolutePath, 'utf-8');
  } catch {
    // Unreadable or binary file — skip rather than fail the whole search.
    return null;
  }
}

function matchLine(regex: RegExp, line: string): RegExpExecArray | null {
  regex.lastIndex = 0;
  return regex.exec(line);
}

function toGrepMatch(
  filePath: string,
  lineNumber: number,
  match: RegExpExecArray,
  lineContent: string
): GrepMatch {
  return {
    filePath,
    line: lineNumber,
    column: match.index + 1,
    match: match[0],
    lineContent,
  };
}

function scanFile(
  regex: RegExp,
  filePath: string,
  content: string,
  state: SearchState
): boolean {
  const lines = content.split(/\r?\n/);
  let fileMatchCount = 0;
  for (let i = 0; i < lines.length && state.collected() < state.limit; i++) {
    const line = lines[i] ?? '';
    const match = matchLine(regex, line);
    if (match === null) continue;

    if (state.listMatchingFiles) {
      state.files.add(filePath);
      return false;
    }

    state.matches.push(toGrepMatch(filePath, i + 1, match, line));
    fileMatchCount++;
    if (fileMatchCount >= MAX_MATCHES_PER_FILE) {
      return i < lines.length - 1;
    }
  }
  return false;
}

async function searchFiles(
  regex: RegExp,
  filePattern: string | undefined,
  { cwd, limit, listMatchingFiles, signal }: SearchOptions
): Promise<GrepSearchResult> {
  const matches: GrepMatch[] = [];
  const files = new Set<string>();
  const state: SearchState = {
    matches,
    files,
    limit,
    listMatchingFiles,
    collected: () => (listMatchingFiles ? files.size : matches.length),
  };

  let limitReached = false;
  let perFileLimitHit = false;

  for await (const relativePath of listCandidateFiles(cwd, filePattern)) {
    if (signal.aborted) break;
    if (state.collected() >= limit) {
      limitReached = true;
      break;
    }

    const filePath = path.resolve(cwd, relativePath);
    const content = await readFileOrSkip(filePath);
    if (content === null) continue;
    perFileLimitHit ||= scanFile(regex, filePath, content, state);
  }

  return {
    matches,
    files: [...files].sort(),
    truncated: limitReached || perFileLimitHit,
  };
}

function toToolOutput(result: GrepSearchResult, listMatchingFiles: boolean) {
  return listMatchingFiles
    ? { matches: [], files: result.files }
    : { matches: result.matches, files: [] };
}
