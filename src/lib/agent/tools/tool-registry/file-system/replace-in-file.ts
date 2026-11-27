import { isEmptyString, isNil, isNotNil, isNonEmptyArray } from '@vxti/typed';
import { readFile, writeFile } from 'fs/promises';
import path from 'node:path';
import * as z from 'zod';
import { Result } from '../../../../result';
import { store } from '../../../../state';
import { formatDiffMd } from '../../../../utils/diff-utils';
import { detectLineEnding, LINE_BREAK } from '../../../../utils/string-utils';
import { createTool } from '../../tool-definition';

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
        ' indentation. Copy it verbatim from the file content — from `read_file` output' +
        ' without the `<n>\\t` line-number prefixes.'
    ),
  newString: z
    .string()
    .describe(
      'The text to put in place of `oldString`. May span multiple lines separated by' +
        ' `\\n`, or be empty to delete `oldString` entirely. Content outside the match' +
        " is preserved, as are the file's line endings and trailing-newline state."
    ),
});

const outputSchema = z.object({
  filePath: z.string(),
  startLine: z.number(),
  matchKind: z.enum(['exact', 'whitespace']),
});

const MAX_SHOWN_LINES = 5;
const TRAILING_LINE_BREAK = /\r?\n$/;
/** Errnos that mean the path holds no file, whichever call reported them. */
const MISSING_FILE_ERRNOS: ReadonlySet<string> = new Set(['ENOENT', 'ENOTDIR']);

export const replaceInFile = createTool({
  internalName: 'replace_in_file',
  name: 'Replace in file',
  description:
    'Replaces an exact occurrence of `oldString` in `filePath` with `newString`. Copy' +
    ' `oldString` verbatim from the file — from `read_file` output without the' +
    ' `<n>\\t` line-number prefixes — including its indentation; it must match exactly' +
    ' once.\n\n' +
    'Rules:\n' +
    '  • Multiple matches are rejected with the matching line numbers; include more' +
    ' surrounding lines in `oldString` to make it unique.\n' +
    '  • No exact match: a fallback matches whole lines ignoring leading/trailing' +
    ' whitespace per line and replaces them with `newString` as sent.\n' +
    '  • Still no match: re-read the file — it may have changed on disk.\n' +
    '  • `newString` may be empty to delete the match. Line endings and content' +
    ' outside the match are preserved.',
  inputSchema,
  outputSchema,

  requiresApproval: () => true,

  handle: handleReplaceInFile,

  formatArguments({ filePath, oldString, newString }) {
    return (
      `Editing \`${path.basename(filePath)}\`:\n\n` +
      '```\n' +
      `${ellipsize(oldString)}\n...\n${ellipsize(newString)}\n` +
      '```'
    );
  },

  inputToString({ filePath }) {
    return `Editing \`${path.basename(filePath)}\``;
  },

  outputToString({ filePath, matchKind }, _, { previous, current }) {
    const fileName = path.basename(filePath);
    const whitespaceNote =
      matchKind === 'whitespace'
        ? '\n\nMatched ignoring per-line indentation; whole lines were replaced.'
        : '';
    return `Edited \`${fileName}\`\n\n${formatDiffMd(previous, current)}${whitespaceNote}`;
  },
});

async function handleReplaceInFile({
  filePath,
  oldString,
  newString,
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
  if (oldString === newString) {
    return Result.Error(
      '`oldString` and `newString` are identical; nothing to replace.'
    );
  }

  const newline = detectLineEnding(original);

  let matched = oldString;
  let replacement = newString;
  let occurrences = countOccurrences(original, oldString);
  if (occurrences === 0 && newline !== '\n' && oldString.includes('\n')) {
    // The model cannot know which line endings the file on disk uses, so a
    // multi-line `oldString` sent with `\n` is retried in the file's endings.
    matched = convertLineEndings(oldString, newline);
    replacement = convertLineEndings(newString, newline);
    occurrences = countOccurrences(original, matched);
  }
  if (occurrences > 1) {
    return Result.Error(
      tooManyMatches(original, filePath, matched, occurrences)
    );
  }

  if (occurrences === 1) {
    const index = original.indexOf(matched);
    const updated =
      original.slice(0, index) +
      replacement +
      original.slice(index + matched.length);

    return writeResult({
      filePath,
      absolutePath,
      fileCache,
      original,
      updated,
      startLine: lineNumberAt(original, index),
      matchKind: 'exact',
    });
  }

  // Still not found exactly once: whole-line fallback, ignoring indentation.
  const whitespace = matchWhitespaceLenient({
    original,
    newline,
    oldString,
    newString,
    filePath,
  });
  if (!whitespace.ok) return Result.Error(whitespace.error);

  return writeResult({
    filePath,
    absolutePath,
    fileCache,
    original,
    updated: whitespace.updated,
    startLine: whitespace.startLine,
    matchKind: 'whitespace',
  });
}

interface WriteArgs {
  filePath: string;
  absolutePath: string;
  fileCache: { update: (path: string) => Promise<void> };
  original: string;
  updated: string;
  startLine: number;
  matchKind: 'exact' | 'whitespace';
}

async function writeResult({
  filePath,
  absolutePath,
  fileCache,
  original,
  updated,
  startLine,
  matchKind,
}: WriteArgs) {
  try {
    await writeFile(absolutePath, updated, 'utf-8');
  } catch (cause) {
    return Result.Error(describeIoFailure('write to', absolutePath, cause));
  }
  await fileCache.update(absolutePath);

  return Result.Ok(
    { filePath, startLine, matchKind },
    { previous: original, current: updated }
  );
}

/** Non-overlapping occurrence count of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function convertLineEndings(text: string, newline: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n/g, newline);
}

/** 1-based line number of the character at `index`. */
function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function tooManyMatches(
  original: string,
  filePath: string,
  needle: string,
  count: number
): string {
  const lineNumbers: number[] = [];
  let index = original.indexOf(needle);
  while (index !== -1 && lineNumbers.length < 5) {
    lineNumbers.push(lineNumberAt(original, index));
    index = original.indexOf(needle, index + needle.length);
  }
  return (
    `\`oldString\` matches ${count} times in \`${filePath}\`` +
    ` (lines ${lineNumbers.join(', ')}). Add surrounding lines to make it unique.`
  );
}

type WhitespaceMatch =
  | { ok: true; updated: string; startLine: number }
  | { ok: false; error: string };

/**
 * Whole-line fallback: every line of `oldString` must equal a consecutive run
 * of file lines up to leading/trailing whitespace, and the run must be unique.
 * The run is replaced by `newString`'s lines verbatim.
 */
interface WhitespaceMatchArgs {
  original: string;
  newline: string;
  oldString: string;
  newString: string;
  filePath: string;
}

function matchWhitespaceLenient({
  original,
  newline,
  oldString,
  newString,
  filePath,
}: WhitespaceMatchArgs): WhitespaceMatch {
  const hadTrailingNewline = TRAILING_LINE_BREAK.test(original);
  const lines = original.split(LINE_BREAK);
  if (hadTrailingNewline) lines.pop();

  const oldLines = oldString.replace(/\r\n/g, '\n').split('\n');
  // Leading/trailing empty lines only anchor the match at line boundaries.
  const firstOld = oldLines[0];
  if (firstOld === '') oldLines.shift();
  const lastOld = oldLines.at(-1);
  if (lastOld === '') oldLines.pop();

  if (oldLines.every(line => line.trim() === '')) {
    return { ok: false, error: '`oldString` contains no content to match.' };
  }

  const width = oldLines.length;
  const windowStarts: number[] = [];
  for (let start = 0; start + width <= lines.length; start++) {
    let matches = true;
    for (let i = 0; i < width; i++) {
      const fileLine = lines[start + i];
      if (isNil(fileLine) || fileLine.trim() !== oldLines[i]?.trim()) {
        matches = false;
        break;
      }
    }
    if (matches) windowStarts.push(start);
  }

  const [firstStart, secondStart] = windowStarts;
  if (isNil(firstStart)) {
    return {
      ok: false,
      error:
        `\`oldString\` was not found in \`${filePath}\`, not even ignoring` +
        ' indentation. The file may have changed; re-read it and retry.',
    };
  }
  if (isNotNil(secondStart)) {
    return {
      ok: false,
      error:
        `\`oldString\` (ignoring indentation) matches ${windowStarts.length} times in` +
        ` \`${filePath}\` (lines ${windowStarts.map(s => s + 1).join(', ')}).` +
        ' Add surrounding lines to make it unique.',
    };
  }

  const newLines = newString.replace(/\r\n/g, '\n').split('\n');
  const lastNew = newLines.at(-1);
  if (lastNew === '') newLines.pop();
  lines.splice(firstStart, width, ...newLines);

  let updated = lines.join(newline);
  if (hadTrailingNewline && isNonEmptyArray(lines)) {
    updated += newline;
  }

  return { ok: true, updated, startLine: firstStart + 1 };
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
