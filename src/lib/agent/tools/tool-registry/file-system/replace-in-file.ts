import { isEmptyString, isNil, isNotNil, isNonEmptyArray } from '@vxti/typed';
import { readFile, writeFile } from 'fs/promises';
import { escapeRegExp, range, sumBy } from 'lodash-es';
import path from 'node:path';
import * as z from 'zod';
import { Result } from '../../../../result';
import { store } from '../../../../state';
import {
  diffLanguageForFile,
  generateSideBySideDiff,
} from '../../../../utils/diff-utils';
import {
  detectLineEnding,
  levenshteinDistance,
  toUnixLineEndings,
} from '../../../../utils/string-utils';
import { createTool } from '../../tool-definition';
import { MessagePartType } from '../../../../types/messages';

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The path of the file to edit. May be absolute or relative to the working directory.'
    ),
  oldString: z
    .string()
    .describe(
      'The exact text to replace. Must appear in the file exactly once, including' +
        ' indentation, unless `replaceAll` is set. Copy it verbatim from the file' +
        ' content — from `read_file` output without the `<n>\\t` line-number prefixes.'
    ),
  newString: z
    .string()
    .describe(
      'The text to put in place of `oldString`. May span multiple lines separated by' +
        ' `\\n`, or be empty to delete `oldString` entirely. Content outside the match' +
        " is preserved, as are the file's line endings and trailing-newline state."
    ),
  replaceAll: z
    .boolean()
    .optional()
    .describe(
      'Replace every occurrence of `oldString` instead of requiring a unique match.' +
        ' Defaults to false. Fuzzy matching is never applied when set.'
    ),
});

const outputSchema = z.object({
  filePath: z.string(),
  startLine: z.number(),
  matchKind: z.enum(['exact', 'whitespace', 'token', 'fuzzy']),
  occurrences: z.number(),
  similarity: z.number().optional(),
});

type MatchKind = z.infer<typeof outputSchema>['matchKind'];

const MAX_SHOWN_LINES = 5;
const MAX_LISTED_LINES = 5;
/** Share of the compared characters that must survive unedited for a fuzzy match. */
const FUZZY_SIMILARITY_THRESHOLD = 0.9;
/** Below this many non-whitespace characters, a fuzzy match is too likely to be a false positive. */
const FUZZY_MIN_CONTENT_LENGTH = 10;
/** Rough cap on character comparisons, keeping a fuzzy search on a large file under a second. */
const FUZZY_MAX_COMPARISONS = 400_000_000;
const PERCENT = 100;
/** Punctuation that may be surrounded by any amount of whitespace in a token match. */
const TOKEN_DELIMITERS = '()[]{}<>:=,;';
const LEADING_INDENTATION = /^[ \t]*/;
const DELIMITER_SPLIT = new RegExp(`([${escapeRegExp(TOKEN_DELIMITERS)}])`);
/** Errnos that mean the path holds no file, whichever call reported them. */
const MISSING_FILE_ERRNOS: ReadonlySet<string> = new Set(['ENOENT', 'ENOTDIR']);

export const replaceInFile = createTool({
  internalName: 'replace_in_file',
  name: 'Replace in file',
  description:
    'Replaces an exact occurrence of `oldString` in `filePath` with `newString`. Copy' +
    ' `oldString` verbatim from the file — from `read_file` output without the' +
    ' `<n>\\t` line-number prefixes — including its indentation; it must match exactly' +
    ' once unless `replaceAll` is set.\n\n' +
    'Rules:\n' +
    '  • Multiple matches are rejected with the matching line numbers; include more' +
    ' surrounding lines in `oldString` to make it unique, or set `replaceAll` to' +
    ' replace every occurrence.\n' +
    '  • No exact match: a fallback matches whole lines ignoring leading/trailing' +
    ' whitespace per line.\n' +
    '  • Still no match: a fallback matches the same tokens with any whitespace, including' +
    ' line breaks, between them.\n' +
    '  • Still no match (and `replaceAll` unset): a fuzzy fallback replaces the single' +
    ` run of lines at least ${FUZZY_SIMILARITY_THRESHOLD * PERCENT}% similar to` +
    ' `oldString`, tolerating small edits made to the file since it was read.\n' +
    '  • Fallback matches re-indent `newString` to the indentation of the matched text.\n' +
    '  • Still no match: re-read the file — it has changed on disk.\n' +
    '  • An edit that would leave the file unchanged is rejected.\n' +
    '  • `newString` may be empty to delete the match. Line endings and content' +
    ' outside the match are preserved.',
  inputSchema,
  outputSchema,

  requiresApproval: () => {
    return !store.getState().agent.autoApprove;
  },

  handle: handleReplaceInFile,

  formatArguments({ filePath, oldString, newString, replaceAll }) {
    const scope = replaceAll ? ' (all occurrences)' : '';
    return (
      `Editing \`${path.basename(filePath)}\`${scope}:\n\n` +
      '```\n' +
      `${ellipsize(oldString)}\n...\n${ellipsize(newString)}\n` +
      '```'
    );
  },

  inputToString({ filePath }) {
    return `Editing \`${path.basename(filePath)}\``;
  },

  outputToString({ filePath, matchKind, occurrences, similarity }) {
    const fileName = path.basename(filePath);
    const notes = [
      occurrences > 1 ? `Replaced ${occurrences} occurrences.` : undefined,
      matchKindNote(matchKind, similarity),
    ].filter(isNotNil);
    const noteBlock = notes.map(note => `\n\n${note}`).join('');
    return `Edited \`${fileName}\`${noteBlock}`;
  },

  outputToParts({ filePath }, __, { previous, current }) {
    return [
      {
        type: MessagePartType.DIFF,
        previous,
        current,
        rows: generateSideBySideDiff(previous, current),
        language: diffLanguageForFile(filePath),
      },
    ];
  },
});

function matchKindNote(
  matchKind: MatchKind,
  similarity: number | undefined
): string | undefined {
  if (matchKind === 'whitespace') {
    return 'Matched ignoring per-line indentation; whole lines were replaced and re-indented.';
  }
  if (matchKind === 'token') {
    return 'Matched ignoring whitespace between tokens; the replacement was re-indented.';
  }
  if (matchKind === 'fuzzy') {
    return (
      `Fuzzy-matched at ${toPercent(similarity ?? 0)}% similarity; whole lines` +
      ' were replaced.'
    );
  }
  return undefined;
}

/** Matchers see the file, `oldString` and `newString` with `\n` line endings only. */
interface MatchContext {
  content: string;
  oldString: string;
  newString: string;
  replaceAll: boolean;
  filePath: string;
}

interface Edit {
  updated: string;
  startLine: number;
  occurrences: number;
  matchKind: MatchKind;
  similarity?: number;
}

type MatchAttempt =
  | { status: 'applied'; edit: Edit }
  | { status: 'rejected'; error: string }
  | { status: 'unmatched' };

const UNMATCHED: MatchAttempt = { status: 'unmatched' };

const MATCHERS: ReadonlyArray<(context: MatchContext) => MatchAttempt> = [
  matchExact,
  matchWhitespaceLenient,
  matchTokens,
  matchFuzzy,
];

async function handleReplaceInFile({
  filePath,
  oldString,
  newString,
  replaceAll = false,
}: z.infer<typeof inputSchema>) {
  const {
    agent: {
      agent: { fileCache },
    },
    fileSystem: { cwd },
  } = store.getState();
  const absolutePath = path.resolve(cwd, filePath);

  // No preflight existence check: the read is the check, so a file removed in
  // between the two calls can never be edited as though it were still there.
  let original: string;
  try {
    original = await readFile(absolutePath, 'utf-8');
  } catch (cause) {
    return Result.Error(describeIoFailure('read', absolutePath, cause));
  }

  if (isEmptyString(oldString)) {
    return Result.Error('`oldString` is empty.');
  }

  // The model cannot know which line endings the file on disk uses, so all
  // matching happens in `\n` and the file's own endings are restored on write.
  const context: MatchContext = {
    content: toUnixLineEndings(original),
    oldString: toUnixLineEndings(oldString),
    newString: toUnixLineEndings(newString),
    replaceAll,
    filePath,
  };
  if (context.oldString === context.newString) {
    return Result.Error(
      '`oldString` and `newString` are identical; nothing to replace.'
    );
  }

  for (const matcher of MATCHERS) {
    const attempt = matcher(context);
    if (attempt.status === 'rejected') return Result.Error(attempt.error);
    if (attempt.status === 'applied') {
      if (attempt.edit.updated === context.content) {
        return Result.Error(unchanged(filePath, attempt.edit));
      }
      return writeResult({
        filePath,
        absolutePath,
        fileCache,
        original,
        edit: {
          ...attempt.edit,
          updated: convertLineEndings(
            attempt.edit.updated,
            detectLineEnding(original)
          ),
        },
      });
    }
  }

  return Result.Error(notFound(filePath, replaceAll));
}

interface WriteArgs {
  filePath: string;
  absolutePath: string;
  fileCache: { update: (path: string) => Promise<void> };
  original: string;
  edit: Edit;
}

async function writeResult({
  filePath,
  absolutePath,
  fileCache,
  original,
  edit: { updated, ...summary },
}: WriteArgs) {
  try {
    await writeFile(absolutePath, updated, 'utf-8');
    await fileCache.update(absolutePath);
  } catch (cause) {
    return Result.Error(describeIoFailure('write to', absolutePath, cause));
  }

  return Result.Ok({
    data: { filePath, ...summary },
    context: { previous: original, current: updated },
  });
}

function applied(edit: Edit): MatchAttempt {
  return { status: 'applied', edit };
}

function rejected(error: string): MatchAttempt {
  return { status: 'rejected', error };
}

function matchExact({
  content,
  oldString,
  newString,
  replaceAll,
  filePath,
}: MatchContext): MatchAttempt {
  const occurrences = countOccurrences(content, oldString);

  if (occurrences === 0) return UNMATCHED;
  if (occurrences > 1 && !replaceAll) {
    return rejected(
      tooManyMatches(
        filePath,
        '',
        occurrences,
        matchLineNumbers(content, oldString)
      )
    );
  }

  return applied({
    updated: content.split(oldString).join(newString),
    startLine: lineNumberAt(content, content.indexOf(oldString)),
    occurrences,
    matchKind: 'exact',
  });
}

/**
 * Whole-line fallback: every line of `oldString` must equal a consecutive run
 * of file lines up to leading/trailing whitespace.
 */
function matchWhitespaceLenient({
  content,
  oldString,
  newString,
  replaceAll,
  filePath,
}: MatchContext): MatchAttempt {
  const file = splitFileLines(content);
  const oldLines = contentLines(oldString).map(line => line.trim());

  if (oldLines.every(line => isEmptyString(line))) {
    return rejected('`oldString` contains no content to match.');
  }

  const width = oldLines.length;
  const starts = nonOverlapping(
    windowStarts(file.lines, width).filter(start =>
      oldLines.every((line, i) => file.lines[start + i]?.trim() === line)
    ),
    width
  );

  const [firstStart] = starts;
  if (isNil(firstStart)) return UNMATCHED;
  if (starts.length > 1 && !replaceAll) {
    return rejected(
      tooManyMatches(
        filePath,
        ' (ignoring indentation)',
        starts.length,
        starts.map(start => start + 1)
      )
    );
  }

  return applied({
    updated: replaceWindows({ file, starts, width, newString }),
    startLine: firstStart + 1,
    occurrences: starts.length,
    matchKind: 'whitespace',
  });
}

/**
 * Token fallback: the tokens of `oldString` in order, starting a line, with any
 * whitespace between them — so re-wrapped lines and changed spacing around
 * punctuation still match.
 */
function matchTokens({
  content,
  oldString,
  newString,
  replaceAll,
  filePath,
}: MatchContext): MatchAttempt {
  const pattern = tokenPattern(oldString);
  if (isNil(pattern)) return UNMATCHED;

  const matches = [...content.matchAll(pattern)];
  const [firstMatch] = matches;
  if (isNil(firstMatch)) return UNMATCHED;
  if (matches.length > 1 && !replaceAll) {
    return rejected(
      tooManyMatches(
        filePath,
        ' (ignoring whitespace)',
        matches.length,
        matches.map(match => lineNumberAt(content, match.index))
      )
    );
  }

  const newLines = replacementLines(newString);
  let updated = content;
  for (const match of [...matches].reverse()) {
    const [matchedText, indentation = ''] = match;
    updated =
      updated.slice(0, match.index) +
      reindent(newLines, indentation).join('\n') +
      updated.slice(match.index + matchedText.length);
  }

  return applied({
    updated,
    startLine: lineNumberAt(content, firstMatch.index),
    occurrences: matches.length,
    matchKind: 'token',
  });
}

function tokenPattern(oldString: string): RegExp | undefined {
  const tokens = oldString
    .split(/\s+/)
    .flatMap(word => word.split(DELIMITER_SPLIT))
    .filter(token => !isEmptyString(token));
  if (!isNonEmptyArray(tokens)) return undefined;

  const body = tokens
    .map((token, i) => {
      const previous = tokens[i - 1];
      if (isNil(previous)) return escapeRegExp(token);
      // Two adjacent words were only split because whitespace separated them.
      const separator =
        isDelimiter(previous) || isDelimiter(token) ? '\\s*' : '\\s+';
      return separator + escapeRegExp(token);
    })
    .join('');
  return new RegExp(`^([ \\t]*)${body}`, 'gm');
}

function isDelimiter(token: string): boolean {
  return token.length === 1 && TOKEN_DELIMITERS.includes(token);
}

/**
 * Similarity fallback for a file edited since it was read: the unique run of
 * lines, as many as `oldString` has, whose trimmed text is within
 * {@link FUZZY_SIMILARITY_THRESHOLD} of it by edit distance.
 */
function matchFuzzy({
  content,
  oldString,
  newString,
  replaceAll,
  filePath,
}: MatchContext): MatchAttempt {
  if (replaceAll) return UNMATCHED;

  const file = splitFileLines(content);
  const oldLines = contentLines(oldString).map(line => line.trim());
  const width = oldLines.length;

  const contentLength = sumBy(oldLines, line => line.replace(/\s/g, '').length);
  const comparisons =
    file.lines.length * sumBy(oldLines, line => line.length ** 2);
  if (
    contentLength < FUZZY_MIN_CONTENT_LENGTH ||
    comparisons > FUZZY_MAX_COMPARISONS
  ) {
    return UNMATCHED;
  }

  const candidates = windowStarts(file.lines, width)
    .map(start => ({
      start,
      similarity: windowSimilarity(
        file.lines.slice(start, start + width),
        oldLines
      ),
    }))
    .filter(hasSimilarity)
    .sort((a, b) => b.similarity - a.similarity);

  const distinct: typeof candidates = [];
  for (const candidate of candidates) {
    const overlapsKept = distinct.some(
      kept => Math.abs(kept.start - candidate.start) < width
    );
    if (!overlapsKept) distinct.push(candidate);
  }

  const [best, secondBest] = distinct;
  if (isNil(best)) return UNMATCHED;
  if (isNotNil(secondBest)) {
    const lineNumbers = distinct
      .map(candidate => candidate.start + 1)
      .sort((a, b) => a - b);
    return rejected(
      `\`oldString\` was not found exactly in \`${filePath}\` and resembles` +
        ` ${lineNumbers.length} places (lines ${listLines(lineNumbers)}).` +
        ' Re-read the file and retry with its current content.'
    );
  }

  return applied({
    updated: replaceWindows({ file, starts: [best.start], width, newString }),
    startLine: best.start + 1,
    occurrences: 1,
    matchKind: 'fuzzy',
    similarity: best.similarity,
  });
}

function hasSimilarity<T extends { similarity: number | undefined }>(
  candidate: T
): candidate is T & { similarity: number } {
  return isNotNil(candidate.similarity);
}

/**
 * Share of characters left unedited between the trimmed `fileLines` and
 * `oldLines`, or `undefined` once it provably falls below the threshold. The
 * length difference bounds the distance from below, so most windows are
 * dismissed without computing any distance at all.
 */
function windowSimilarity(
  fileLines: string[],
  oldLines: string[]
): number | undefined {
  const pairs = oldLines.map((oldLine, i) => ({
    fileLine: fileLines[i]?.trim() ?? '',
    oldLine,
  }));
  const comparedLength = sumBy(pairs, ({ fileLine, oldLine }) =>
    Math.max(fileLine.length, oldLine.length)
  );
  const editBudget = (1 - FUZZY_SIMILARITY_THRESHOLD) * comparedLength;

  const lengthGap = sumBy(pairs, ({ fileLine, oldLine }) =>
    Math.abs(fileLine.length - oldLine.length)
  );
  if (lengthGap > editBudget) return undefined;

  let distance = 0;
  for (const { fileLine, oldLine } of pairs) {
    distance += levenshteinDistance(fileLine, oldLine);
    if (distance > editBudget) return undefined;
  }
  return 1 - distance / comparedLength;
}

interface FileLines {
  lines: string[];
  hadTrailingNewline: boolean;
}

function splitFileLines(content: string): FileLines {
  const hadTrailingNewline = content.endsWith('\n');
  const lines = content.split('\n');
  if (hadTrailingNewline) lines.pop();
  return { lines, hadTrailingNewline };
}

/** Lines of `text`, minus the empty edge lines that only anchor it at line boundaries. */
function contentLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines[0] === '') lines.shift();
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/** Lines of `newString`; a trailing line break adds no line of its own. */
function replacementLines(newString: string): string[] {
  const lines = newString.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

function windowStarts(lines: string[], width: number): number[] {
  return range(0, Math.max(lines.length - width + 1, 0));
}

/** Keeps the earliest of any overlapping runs, as a left-to-right scan would. */
function nonOverlapping(starts: number[], width: number): number[] {
  const kept: number[] = [];
  for (const start of starts) {
    const previous = kept.at(-1);
    if (isNil(previous) || start >= previous + width) kept.push(start);
  }
  return kept;
}

interface WindowReplacement {
  file: FileLines;
  starts: number[];
  width: number;
  newString: string;
}

function replaceWindows({
  file: { lines, hadTrailingNewline },
  starts,
  width,
  newString,
}: WindowReplacement): string {
  const newLines = replacementLines(newString);

  const updatedLines = [...lines];
  for (const start of [...starts].reverse()) {
    const indentation = indentationOf(lines.slice(start, start + width));
    updatedLines.splice(start, width, ...reindent(newLines, indentation));
  }

  const updated = updatedLines.join('\n');
  return hadTrailingNewline && isNonEmptyArray(updatedLines)
    ? `${updated}\n`
    : updated;
}

/** Indentation of the first non-blank line. */
function indentationOf(lines: string[]): string {
  const firstContentLine = lines.find(line => !isEmptyString(line.trim()));
  return firstContentLine?.match(LEADING_INDENTATION)?.[0] ?? '';
}

/**
 * Moves `lines` to `indentation`, keeping their indentation relative to their
 * first non-blank line; lines indented less than it are aligned with it.
 */
function reindent(lines: string[], indentation: string): string[] {
  const reference = indentationOf(lines);
  return lines.map(line => {
    if (isEmptyString(line.trim())) return '';
    const body = line.startsWith(reference)
      ? line.slice(reference.length)
      : line.trimStart();
    return indentation + body;
  });
}

/** Non-overlapping occurrence count of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function convertLineEndings(text: string, newline: string): string {
  return toUnixLineEndings(text).replace(/\n/g, newline);
}

/** 1-based line number of the character at `index`. */
function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** Line numbers of the first {@link MAX_LISTED_LINES} occurrences of `needle`. */
function matchLineNumbers(content: string, needle: string): number[] {
  const lineNumbers: number[] = [];
  let index = content.indexOf(needle);
  while (index !== -1 && lineNumbers.length < MAX_LISTED_LINES) {
    lineNumbers.push(lineNumberAt(content, index));
    index = content.indexOf(needle, index + needle.length);
  }
  return lineNumbers;
}

function listLines(lineNumbers: number[]): string {
  return lineNumbers.slice(0, MAX_LISTED_LINES).join(', ');
}

function tooManyMatches(
  filePath: string,
  qualifier: string,
  count: number,
  lineNumbers: number[]
): string {
  return (
    `\`oldString\`${qualifier} matches ${count} times in \`${filePath}\`` +
    ` (lines ${listLines(lineNumbers)}). Add surrounding lines to make it` +
    ' unique, or set `replaceAll` to replace every occurrence.'
  );
}

function notFound(filePath: string, replaceAll: boolean): string {
  const searched = replaceAll
    ? 'not even ignoring whitespace (fuzzy matching is not applied with `replaceAll`)'
    : 'not even ignoring whitespace or allowing for small edits';
  return (
    `\`oldString\` was not found in \`${filePath}\`, ${searched}.` +
    ' The file may have changed; re-read it and retry.'
  );
}

function unchanged(filePath: string, { matchKind, startLine }: Edit): string {
  return (
    `\`oldString\` matched in \`${filePath}\` (line ${startLine}, ${matchKind} match),` +
    ' but replacing it leaves the file unchanged: the text there already reads as' +
    ' `newString`. Nothing was written; re-read the file and check the edit is still needed.'
  );
}

function toPercent(fraction: number): number {
  return Math.round(fraction * PERCENT);
}

/** Ellipsizes to the last `MAX_SHOWN_LINES` lines, like the diff renderer. */
function ellipsize(text: string): string {
  const lines = text.split('\n');
  return lines.length > MAX_SHOWN_LINES
    ? `...${lines.slice(-MAX_SHOWN_LINES).join('\n')}`
    : text;
}

/**
 * Frames a filesystem failure so the model can act on it: the file concerned is
 * named absolutely and the underlying detail is kept, so an unexpected
 * `EACCES` or `EISDIR` is never reported as a missing file, and a non-`Error`
 * throw is surfaced rather than reduced to a generic one.
 */
function describeIoFailure(
  action: 'read' | 'write to',
  absolutePath: string,
  cause: unknown
): string {
  const code = errnoOf(cause);
  const headline =
    isNotNil(code) && MISSING_FILE_ERRNOS.has(code)
      ? `No file exists at \`${absolutePath}\``
      : `Could not ${action} \`${absolutePath}\``;

  return `${headline} (${detailOf(cause)}).`;
}

/** The errno a filesystem call failed with, when it carried one. */
function errnoOf(cause: unknown): string | undefined {
  if (!(cause instanceof Error)) return undefined;

  const { code } = cause as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
}

/**
 * What actually went wrong, minus the errno token: `ENOENT: no such file or
 * directory, open '/x'` reads back as `no such file or directory, open '/x'`,
 * keeping the detail without echoing back the code it names.
 */
function detailOf(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);

  const code = errnoOf(cause);
  const prefix = isNil(code) ? '' : `${code}: `;
  if (!cause.message.startsWith(prefix)) return cause.message;

  return cause.message.slice(prefix.length);
}
