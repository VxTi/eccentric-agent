import { isEmptyString, isNil, isNonEmptyArray, isNotNil } from '@vxti/typed';
import { readFile, writeFile } from 'fs/promises';
import path from 'node:path';
import * as z from 'zod';
import { Result } from '../../../../result';
import { store } from '../../../../state';
import { formatDiffMd } from '../../../../utils/diff-utils';
import { existsAsync } from '../../../../utils/fs';
import { detectLineEnding, LINE_BREAK } from '../../../../utils/string-utils';
import { createTool } from '../../tool-definition';

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The path of the file to edit. May be absolute or relative to the working directory.'
    ),
  range: z.object({
    lineNumber: z
      .number()
      .int()
      .min(1)
      .describe(
        'The 1-based line number where the replacement range starts (inclusive), as last' +
          ' seen in `read_file` output. Used as a hint; `anchor` decides the actual line.'
      ),
    anchor: z
      .string()
      .describe(
        'The exact current content of the first line being replaced (without the line-number' +
          ' prefix). Used to locate the range if lines shifted since you last read the file.'
      ),
    count: z
      .number()
      .int()
      .min(1)
      .describe(
        'The number of consecutive lines to replace, starting at the anchored line. Must be >= 1.'
      ),
  }),
  replacement: z
    .string()
    .describe(
      'The text to insert in place of the removed range. May contain multiple lines' +
        ' separated by `\\n`, or be empty to delete the range entirely. A trailing `\\n`' +
        ' is a separator and is dropped; the file keeps its own trailing-newline state.'
    ),
});

const outputSchema = z.object({
  startLine: z.number(),
  linesRemoved: z.number(),
  linesInserted: z.number(),
  duplicatesRemoved: z.number(),
  duplicatedSeamLines: z.array(z.string()),
  filePath: z.string(),
});

const MAX_SHOWN_LINES = 5;
const TRAILING_LINE_BREAK = /\r?\n$/;
const READ_FILE_PREFIX = /^\s*\d+\t/;

export const replaceInFile = createTool({
  internalName: 'replace_in_file',
  name: 'Replace in file',
  description:
    'Replaces a contiguous range of lines in `filePath` with `replacement`. The range' +
    ' starts at the line matching `range.anchor` (exactly, or ignoring surrounding' +
    ' whitespace) near `range.lineNumber`, and spans `range.count` lines (inclusive).\n\n' +
    'Use this tool when changing one or more consecutive lines in a file. To insert new' +
    ' lines without losing existing content, replace a line at the insertion point with' +
    ' `replacement` set to that same line plus the new lines.\n\n' +
    'Rules:\n' +
    '  • `lineNumber` is 1-based; `count` must be >= 1.\n' +
    '  • `anchor` must be the current content of the first replaced line. If that line' +
    '    moved (e.g. after an earlier edit), the nearest matching line is used and' +
    '    reported as `startLine`: matching is exact first, then ignoring surrounding' +
    '    whitespace, with the hinted line preferred when it matches either way. The' +
    '    edit is rejected if no line matches, or if several lines match equally near.\n' +
    '  • A whitespace-only `anchor` matches only at the hinted line; it is never relocated.\n' +
    '  • Only the first line of `anchor` is used, and a copied `read_file` prefix' +
    '    (`<n>\\t`) is ignored, even when its line number is stale.\n' +
    '  • The anchored range must not extend past the end of the file.\n' +
    '  • `replacement` may span multiple lines separated by `\\n`, or be empty to delete' +
    '    the range. A trailing `\\n` in `replacement` is a separator and is dropped.\n' +
    "  • The file's original line ending and trailing-newline state are preserved.\n" +
    '  • If `replacement` begins or ends with lines that exactly duplicate the file' +
    '    lines immediately adjacent to the replaced range (misaligned context from a' +
    '    diff-style hunk), those duplicate lines are dropped and reported as' +
    '    `duplicatesRemoved` and `duplicatedSeamLines`. If you actually intended' +
    '    those duplicates, re-send the edit with the range adjusted to include them.',
  inputSchema,
  outputSchema,

  requiresApproval: () => true,

  handle: handleReplaceInFile,

  formatArguments({ filePath, range, replacement }) {
    const lines = replacement.split('\n');
    const formattedReplacement =
      lines.length > MAX_SHOWN_LINES
        ? `...${lines.slice(-MAX_SHOWN_LINES).join('\n')}`
        : lines.join('\n');

    return `Editing ${describeRange(range.lineNumber, range.count)} in \`${path.basename(filePath)}\`:\n\n\`\`\`\n${formattedReplacement}\n\`\`\``;
  },

  inputToString({ filePath, range }) {
    return `Editing ${describeRange(range.lineNumber, range.count)} in \`${path.basename(filePath)}\``;
  },

  outputToString({ filePath, duplicatedSeamLines }, _, { previous, current }) {
    const fileName = path.basename(filePath);
    const repairNote =
      duplicatedSeamLines.length > 0
        ? `\n\nDropped ${duplicatedSeamLines.length} duplicated seam line(s) from` +
          ` \`replacement\`:\n\`\`\`\n${duplicatedSeamLines.join('\n')}\n\`\`\`\n` +
          'If these were intentional, re-send the edit with the range adjusted to' +
          ' include them.'
        : '';
    return `Edited \`${fileName}\`\n\n${formatDiffMd(previous, current)}${repairNote}`;
  },
});

function describeRange(lineNumber: number, count: number): string {
  return count === 1
    ? `line ${lineNumber}`
    : `lines ${lineNumber}-${lineNumber + count - 1}`;
}

async function handleReplaceInFile({
  filePath,
  range: { lineNumber, anchor, count },
  replacement,
}: z.infer<typeof inputSchema>) {
  const {
    agent: {
      agent: { fileCache },
    },
    fileSystem: { cwd },
  } = store.getState();
  const absolutePath = path.resolve(cwd, filePath);

  if (!(await existsAsync(absolutePath))) {
    return Result.Error(`No file exists at \`${absolutePath}\`.`);
  }

  const original = await readFile(absolutePath, 'utf-8');
  const newline = detectLineEnding(original);
  const hadTrailingNewline = TRAILING_LINE_BREAK.test(original);
  const lines = original.split(LINE_BREAK);
  if (hadTrailingNewline) lines.pop();

  const located = locateRangeStart(lines, lineNumber, anchor);
  if (!located.ok) return Result.Error(located.error);
  const startLine = located.data;

  const endLine = startLine + count - 1;
  if (endLine > lines.length) {
    return Result.Error(
      `Range starting at line ${startLine} with \`count\` ${count} exceeds file length` +
        ` (${lines.length} line(s)).`
    );
  }

  const trimmed = trimDuplicatedSeams(
    lines,
    startLine,
    endLine,
    splitReplacement(replacement)
  );

  lines.splice(startLine - 1, count, ...trimmed.replacementLines);

  let updated = lines.join(newline);
  if (hadTrailingNewline && isNonEmptyArray(lines)) {
    updated += newline;
  }
  await writeFile(absolutePath, updated, 'utf-8');
  await fileCache.update(absolutePath);

  return Result.Ok(
    {
      startLine,
      linesRemoved: count,
      linesInserted: trimmed.replacementLines.length,
      duplicatesRemoved: trimmed.duplicatesRemoved,
      duplicatedSeamLines: trimmed.duplicatedLines,
      filePath,
    },
    {
      previous: original,
      current: updated,
    }
  );
}

function splitReplacement(replacement: string): string[] {
  if (isEmptyString(replacement)) return [];

  const lines = replacement.split(LINE_BREAK);
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
}

/**
 * The hinted line wins when it matches; otherwise the nearest exact match,
 * then the nearest whitespace-insensitive match, so that edits planned from a
 * read made before earlier edits still land on the intended line.
 */
function locateRangeStart(
  lines: string[],
  lineNumber: number,
  rawAnchor: string
): Result<number> {
  const hintedLine = lines[lineNumber - 1];
  if (hintedLine === rawAnchor) return Result.Ok(lineNumber);

  const anchor = normalizeAnchor(rawAnchor, lineNumber);
  const trimmedAnchor = anchor.trim();
  if (hintedLine?.trim() === trimmedAnchor) return Result.Ok(lineNumber);

  if (isEmptyString(trimmedAnchor)) {
    const reason = isNil(hintedLine)
      ? `line ${lineNumber} is out of range: the file has only ${lines.length} line(s)`
      : `line ${lineNumber} does not match the blank \`anchor\``;
    return Result.Error(
      `A blank \`anchor\` cannot be relocated (${reason}). Re-read the file and anchor` +
        ' on a non-blank line.'
    );
  }

  const matchers: Array<(line: string) => boolean> = [
    line => line === anchor,
    line => line.trim() === trimmedAnchor,
  ];

  for (const matches of matchers) {
    const nearest = findNearestMatchingLines(lines, lineNumber, matches);
    if (nearest.length > 1) {
      return Result.Error(
        `\`anchor\` is ambiguous: lines ${nearest.join(', ')} match and are equally` +
          ` near line ${lineNumber}. Re-read the file and anchor on a line that is` +
          ' unique in the file.'
      );
    }
    const [match] = nearest;
    if (isNotNil(match)) return Result.Ok(match);
  }

  const stalePrefixMatch = findUniqueLineWithoutReadFilePrefix(lines, anchor);
  if (isNotNil(stalePrefixMatch)) return Result.Ok(stalePrefixMatch);

  const found = isNil(hintedLine)
    ? `the file has only ${lines.length} line(s)`
    : `line ${lineNumber} is \`${hintedLine}\``;
  return Result.Error(
    `No line matches \`anchor\` (${found}). The file may have changed; re-read it and retry.`
  );
}

/**
 * Models often paste several lines, or the `<n>\t` prefix `read_file` prints,
 * as the anchor; neither can ever equal a single file line.
 */
function normalizeAnchor(anchor: string, lineNumber: number): string {
  const [firstLine = ''] = anchor.split(LINE_BREAK);
  const readFilePrefix = `${lineNumber}\t`;
  const unpadded = firstLine.trimStart();

  return unpadded.startsWith(readFilePrefix)
    ? unpadded.slice(readFilePrefix.length)
    : firstLine;
}

/**
 * Last-resort repair for an anchor copied from an older `read_file` whose
 * `<n>\t` prefix no longer matches the hinted line number. Only an exact
 * match unique in the whole file is accepted, so content that legitimately
 * starts with digits and a tab can never be rewritten onto an unrelated line.
 */
function findUniqueLineWithoutReadFilePrefix(
  lines: string[],
  anchor: string
): number | undefined {
  const withoutPrefix = anchor.replace(READ_FILE_PREFIX, '');
  if (withoutPrefix === anchor || isEmptyString(withoutPrefix))
    return undefined;
  const matches = lines.flatMap((line, index) =>
    line === withoutPrefix ? [index + 1] : []
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** All matching 1-based line numbers at the minimum distance from `hintLine`. */
function findNearestMatchingLines(
  lines: string[],
  hintLine: number,
  matches: (line: string) => boolean
): number[] {
  let nearest: number[] = [];
  let nearestDistance = Infinity;

  lines.forEach((line, index) => {
    if (!matches(line)) return;
    const lineNumber = index + 1;
    const distance = Math.abs(lineNumber - hintLine);
    if (distance < nearestDistance) {
      nearest = [lineNumber];
      nearestDistance = distance;
    } else if (distance === nearestDistance) {
      nearest.push(lineNumber);
    }
  });

  return nearest;
}

/**
 * Drops leading/trailing replacement lines that repeat the file lines just
 * outside the replaced range, as happens when a model sends a diff-style hunk
 * with context. Only seams containing a letter or digit count: a lone `}` or
 * blank line matching its neighbour is as likely intentional as accidental.
 * Nothing is trimmed if that would empty the replacement, since that would
 * silently turn the edit into a deletion.
 */
function trimDuplicatedSeams(
  lines: string[],
  startLine: number,
  endLine: number,
  replacementLines: string[]
): {
  replacementLines: string[];
  duplicatesRemoved: number;
  duplicatedLines: string[];
} {
  const linesAbove = lines.slice(0, startLine - 1);
  const linesBelow = lines.slice(endLine);

  const leading = findLongestSeam(
    replacementLines.length,
    linesAbove.length,
    k => linesEqual(replacementLines.slice(0, k), linesAbove.slice(-k))
  );
  const trailing = findLongestSeam(
    replacementLines.length,
    linesBelow.length,
    k => linesEqual(replacementLines.slice(-k), linesBelow.slice(0, k))
  );

  const leadingTrim = isSignificantSeam(replacementLines.slice(0, leading))
    ? leading
    : 0;
  const trailingTrim = isSignificantSeam(
    replacementLines.slice(replacementLines.length - trailing)
  )
    ? trailing
    : 0;

  if (leadingTrim + trailingTrim >= replacementLines.length) {
    return { replacementLines, duplicatesRemoved: 0, duplicatedLines: [] };
  }

  return {
    replacementLines: replacementLines.slice(
      leadingTrim,
      replacementLines.length - trailingTrim
    ),
    duplicatesRemoved: leadingTrim + trailingTrim,
    duplicatedLines: [
      ...replacementLines.slice(0, leadingTrim),
      ...replacementLines.slice(replacementLines.length - trailingTrim),
    ],
  };
}

function isSignificantSeam(seam: string[]): boolean {
  return seam.some(line => /[\p{L}\p{N}]/u.test(line));
}

function findLongestSeam(
  replacementLength: number,
  contextLength: number,
  matchesAt: (seamLength: number) => boolean
): number {
  for (
    let seamLength = Math.min(replacementLength, contextLength);
    seamLength > 0;
    seamLength--
  ) {
    if (matchesAt(seamLength)) return seamLength;
  }
  return 0;
}

function linesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}
