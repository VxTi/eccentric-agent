import { isEmptyString, isNonEmptyArray } from '@vxti/typed';
import { readFile, writeFile } from 'fs/promises';
import path from 'node:path';
import * as z from 'zod';
import { Result } from '../../../../result';
import { store } from '../../../../state';
import { formatDiffMd } from '../../../../utils/diff-utils';
import { existsAsync } from '../../../../utils/fs';
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
  bytesWritten: z.number(),
  startLine: z.number(),
  linesRemoved: z.number(),
  linesInserted: z.number(),
  duplicatesRemoved: z.number(),
  filePath: z.string(),
});

const MAX_SHOWN_LINES = 5;

export const replaceInFile = createTool({
  internalName: 'replace_in_file',
  name: 'Replace in file',
  description:
    'Replaces a contiguous range of lines in `filePath` with `replacement`. The range' +
    ' starts at the line whose content equals `range.anchor` (near `range.lineNumber`)' +
    ' and spans `range.count` lines (inclusive).\n\n' +
    'Use this tool when changing one or more consecutive lines in a file. To insert new' +
    ' lines without losing existing content, replace a line at the insertion point with' +
    ' `replacement` set to that same line plus the new lines.\n\n' +
    'Rules:\n' +
    '  • `lineNumber` is 1-based; `count` must be >= 1.\n' +
    '  • `anchor` must be the current content of the first replaced line. If that line' +
    '    moved (e.g. after an earlier edit), the nearest line matching `anchor` is used and' +
    '    reported as `startLine`. The edit is rejected if no line matches, or if two' +
    '    matches are equally near.\n' +
    '  • The anchored range must not extend past the end of the file.\n' +
    '  • `replacement` may span multiple lines separated by `\\n`, or be empty to delete' +
    '    the range. A trailing `\\n` in `replacement` is a separator and is dropped.\n' +
    "  • The file's original line ending and trailing-newline state are preserved.\n" +
    '  • If `replacement` begins or ends with lines that exactly duplicate the file' +
    '    lines immediately adjacent to the replaced range (misaligned context from a' +
    '    diff-style hunk), those duplicate lines are dropped and reported as' +
    '    `duplicatesRemoved`.',
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

  outputToString({ filePath, duplicatesRemoved }, _, { previous, current }) {
    const fileName = path.basename(filePath);
    const repairNote =
      duplicatesRemoved > 0
        ? `\n\nDropped ${duplicatesRemoved} duplicated seam line(s) from \`replacement\`.`
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
  const newline = original.match(/\r?\n/)?.[0] ?? '\n';
  const lines = original.split(newline);

  const hadTrailingNewline = original.endsWith(newline);
  if (hadTrailingNewline) lines.pop();

  const anchored = resolveAnchor(lines, lineNumber, anchor);
  if (!anchored.ok) return Result.Error(anchored.error);
  const startLine = anchored.data;

  const endLine = startLine + count - 1;
  if (endLine > lines.length) {
    return Result.Error(
      `Range starting at line ${startLine} with \`count\` ${count} exceeds file length` +
        ` (${lines.length} line(s)).`
    );
  }

  const replacementLines = isEmptyString(replacement)
    ? []
    : replacement.split(/\r?\n/);
  if (
    replacementLines.length > 1 &&
    replacementLines[replacementLines.length - 1] === ''
  ) {
    replacementLines.pop();
  }

  const repaired = repairSeamDuplication(
    lines,
    startLine,
    endLine,
    replacementLines
  );

  lines.splice(startLine - 1, count, ...repaired.replacementLines);

  let updated = lines.join(newline);
  if (hadTrailingNewline && isNonEmptyArray(lines)) {
    updated += newline;
  }
  await writeFile(absolutePath, updated, 'utf-8');
  await fileCache.update(absolutePath);

  return Result.Ok(
    {
      bytesWritten: Buffer.byteLength(updated, 'utf-8'),
      startLine,
      linesRemoved: count,
      linesInserted: repaired.replacementLines.length,
      duplicatesRemoved: repaired.duplicatesRemoved,
      filePath,
    },
    {
      previous: original,
      current: updated,
    }
  );
}

/**
 * Locates the 1-based start line of the range. The hinted line wins when it
 * matches; otherwise the nearest exact match, then the nearest match ignoring
 * surrounding whitespace, so that edits made after earlier edits (which shift
 * line numbers) still land on the intended line instead of on stale positions.
 */
function resolveAnchor(
  lines: string[],
  hintLine: number,
  anchor: string
): Result<number> {
  if (lines[hintLine - 1] === anchor) return Result.Ok(hintLine);

  const trimmedAnchor = anchor.trim();
  // A blank anchor matches every blank line; relocating it would be a guess.
  if (isEmptyString(trimmedAnchor)) {
    return Result.Error(
      `Line ${hintLine} does not match the blank \`anchor\`, and a blank anchor cannot be` +
        ' relocated. Re-read the file and anchor on a non-blank line.'
    );
  }

  const matchers: Array<(line: string) => boolean> = [
    line => line === anchor,
    line => line.trim() === trimmedAnchor,
  ];

  for (const matches of matchers) {
    const nearest = findNearestMatches(lines, hintLine, matches);
    if (nearest.length > 1) {
      return Result.Error(
        `\`anchor\` is ambiguous: lines ${nearest.join(' and ')} match and are equally` +
          ` near line ${hintLine}. Re-read the file and retry with the correct \`lineNumber\`.`
      );
    }
    const [match] = nearest;
    if (match !== undefined) return Result.Ok(match);
  }

  const actual = lines[hintLine - 1];
  const found =
    actual === undefined
      ? `the file has only ${lines.length} line(s)`
      : `line ${hintLine} is \`${actual}\``;
  return Result.Error(
    `No line matches \`anchor\` (${found}). The file may have changed; re-read it and retry.`
  );
}

/** All matching 1-based line numbers at the minimum distance from `hintLine`. */
function findNearestMatches(
  lines: string[],
  hintLine: number,
  matches: (line: string) => boolean
): number[] {
  let best: number[] = [];
  let bestDistance = Infinity;

  lines.forEach((line, index) => {
    if (!matches(line)) return;
    const lineNumber = index + 1;
    const distance = Math.abs(lineNumber - hintLine);
    if (distance < bestDistance) {
      best = [lineNumber];
      bestDistance = distance;
    } else if (distance === bestDistance) {
      best.push(lineNumber);
    }
  });

  return best;
}

/**
 * Trims leading/trailing replacement lines that repeat the file lines just
 * outside the replaced range, as happens when a model sends a diff-style hunk
 * with context. Only seams containing a significant line count: a lone `}` or
 * blank line matching its neighbour is as likely intentional as accidental.
 * If trimming would consume the whole replacement, nothing is trimmed, since
 * that would silently turn the edit into a deletion.
 */
function repairSeamDuplication(
  lines: string[],
  startLine: number,
  endLine: number,
  replacementLines: string[]
): { replacementLines: string[]; duplicatesRemoved: number } {
  const linesAbove = lines.slice(0, startLine - 1);
  const linesBelow = lines.slice(endLine);

  const leading = longestSeam(replacementLines.length, linesAbove.length, k =>
    linesEqual(replacementLines.slice(0, k), linesAbove.slice(-k))
  );
  const trailing = longestSeam(replacementLines.length, linesBelow.length, k =>
    linesEqual(replacementLines.slice(-k), linesBelow.slice(0, k))
  );

  const isSignificant = (seam: string[]) =>
    seam.some(line => /[\p{L}\p{N}]/u.test(line));
  const leadingTrim = isSignificant(replacementLines.slice(0, leading))
    ? leading
    : 0;
  const trailingTrim = isSignificant(
    replacementLines.slice(replacementLines.length - trailing)
  )
    ? trailing
    : 0;

  if (leadingTrim + trailingTrim >= replacementLines.length) {
    return { replacementLines, duplicatesRemoved: 0 };
  }

  return {
    replacementLines: replacementLines.slice(
      leadingTrim,
      replacementLines.length - trailingTrim
    ),
    duplicatesRemoved: leadingTrim + trailingTrim,
  };
}

function longestSeam(
  replacementLength: number,
  contextLength: number,
  matchesAt: (k: number) => boolean
): number {
  for (let k = Math.min(replacementLength, contextLength); k > 0; k--) {
    if (matchesAt(k)) return k;
  }
  return 0;
}

function linesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}
