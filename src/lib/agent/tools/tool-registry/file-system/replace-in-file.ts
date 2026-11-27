import { isEmptyString, isNil, isNotNil, isNonEmptyArray } from '@vxti/typed';
import { readFile, writeFile } from 'fs/promises';
import path from 'node:path';
import * as z from 'zod';
import { Result } from '../../../../result';
import { store } from '../../../../state';
import { formatDiffMd } from '../../../../utils/diff-utils';
import { detectLineEnding, LINE_BREAK } from '../../../../utils/string-utils';
import { createTool } from '../../tool-definition';
import { locateRange, trimDuplicatedSeams } from './replace-in-file-range';

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
        'The 1-based line number where the replacement range starts (inclusive), as' +
          ' last seen in `read_file` output. Proximity hint for resolving' +
          ' `range.leadingAnchor`; the anchors decide the actual line.'
      ),
    leadingAnchor: z
      .string()
      .describe(
        'The exact current content of the first line being replaced (without the' +
          ' line-number prefix). Always required: it locates the range if lines shifted' +
          ' since you last read the file.'
      ),
    trailingAnchor: z
      .string()
      .optional()
      .describe(
        'Exact current content of the last line being replaced' +
          ' (`lineNumber` + `count` - 1), matched exactly, ignoring surrounding' +
          ' whitespace, or with a copied `read_file` prefix stripped. Optional, but' +
          ' supply it for any multi-line range and whenever the leading line is not' +
          ' unique in the file: it pins where the range ends, so a nearer copy of a' +
          ' repeated leading line is not chosen. An off-by-one `count` is corrected' +
          ' and reported as `countAdjustment`; a blank value is ignored.'
      ),
    count: z
      .number()
      .int()
      .min(1)
      .describe(
        'The number of consecutive lines to replace, starting at the anchored line.' +
          ' Must be >= 1. Corrected by one when `trailingAnchor` sits just outside' +
          ' the claimed range; the correction is reported as `countAdjustment`.'
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
  countAdjustment: z
    .number()
    .int()
    .describe(
      'How far `count` was corrected to match `trailingAnchor`: -1, 0, or 1.'
    ),
  linesInserted: z.number(),
  duplicatesRemoved: z.number(),
  duplicatedSeamLines: z.array(z.string()),
  filePath: z.string(),
});

const MAX_SHOWN_LINES = 5;
const TRAILING_LINE_BREAK = /\r?\n$/;
/** Errnos that mean the path holds no file, whichever call reported them. */
const MISSING_FILE_ERRNOS: ReadonlySet<string> = new Set(['ENOENT', 'ENOTDIR']);

export const replaceInFile = createTool({
  internalName: 'replace_in_file',
  name: 'Replace in file',
  description:
    'Replaces a contiguous range of lines in `filePath` with `replacement`. The range' +
    ' starts at the line matching `range.leadingAnchor` near `range.lineNumber` and' +
    ' spans `range.count` lines (inclusive). Use it for any change to one or more' +
    ' consecutive lines; to insert lines without deleting content, replace the line' +
    ' at the insertion point and begin `replacement` with that same line.\n\n' +
    'Rules:\n' +
    '  • `lineNumber` is 1-based; `count` must be >= 1.\n' +
    '  • `leadingAnchor` is the exact current content of the first replaced line,' +
    '    without the `<n>\\t` prefix `read_file` prints. Only its first line is used.' +
    '    A match on the hinted line beats any other; otherwise an exact match beats a' +
    '    whitespace-insensitive one, and the nearest to the hint wins (reported as' +
    '    `startLine`). Rejected when no line matches or when several match equally' +
    '    near.\n' +
    '  • `trailingAnchor` is the exact content of the line the range ends on' +
    '    (`lineNumber + count - 1`), matched exactly, ignoring surrounding' +
    '    whitespace, or with a copied `read_file` prefix stripped. Optional, but' +
    '    supply it for any multi-line range and whenever the leading line is not' +
    '    unique in the file: only ranges whose end line agrees with it are' +
    '    considered, which keeps a nearer copy of a repeated leading line from being' +
    '    chosen. When the claimed end disagrees but the anchor matches exactly one' +
    '    line either side of it, `count` is corrected by one and reported as' +
    '    `countAdjustment`. When it agrees on both sides the range length is' +
    '    ambiguous, and when the endpoints agree nowhere, the edit is rejected' +
    '    without writing.\n' +
    '  • A whitespace-only `leadingAnchor` matches only the hinted line and is never' +
    '    relocated; a blank `trailingAnchor` is ignored.\n' +
    '  • A copied `read_file` prefix (`<n>\\t`) is ignored in anchors, even when its' +
    '    line number is stale — but only after the anchor as sent has had its chance' +
    '    at the hinted line, so content that legitimately opens with digits and a' +
    '    tab is never relocated. As a last resort, an anchor whose copied prefix' +
    '    names a different line matches the content under the prefix, provided that' +
    '    content is unique in the file.\n' +
    '  • The anchored range must not extend past the end of the file.\n' +
    '  • `replacement` may span multiple lines separated by `\\n`, or be empty to' +
    '    delete the range; a trailing `\\n` is a separator and is dropped. Lines at' +
    '    the start or end of `replacement` that exactly duplicate the file lines' +
    '    adjacent to the range (diff-style context pasted by mistake) are dropped' +
    '    and reported as `duplicatesRemoved` and `duplicatedSeamLines`; if they were' +
    '    intentional, re-send the edit with the range adjusted to include them.\n' +
    "  • The file's line endings and trailing-newline state are preserved.",
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

  outputToString(
    { filePath, duplicatedSeamLines, countAdjustment },
    _,
    { previous, current }
  ) {
    const fileName = path.basename(filePath);
    const repairNote =
      duplicatedSeamLines.length > 0
        ? `\n\nDropped ${duplicatedSeamLines.length} duplicated seam line(s) from` +
          ` \`replacement\`:\n\`\`\`\n${duplicatedSeamLines.join('\n')}\n\`\`\`\n` +
          'If these were intentional, re-send the edit with the range adjusted to' +
          ' include them.'
        : '';
    const adjustmentNote =
      countAdjustment === 0
        ? ''
        : `\n\n\`count\` was ${countAdjustment === 1 ? 'one short' : 'one long'};` +
          ' corrected against `trailingAnchor`.';
    return `Edited \`${fileName}\`\n\n${formatDiffMd(previous, current)}${repairNote}${adjustmentNote}`;
  },
});

function describeRange(lineNumber: number, count: number): string {
  return count === 1
    ? `line ${lineNumber}`
    : `lines ${lineNumber}-${lineNumber + count - 1}`;
}

async function handleReplaceInFile({
  filePath,
  range: { lineNumber, leadingAnchor, trailingAnchor, count },
  replacement,
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

  const newline = detectLineEnding(original);
  const hadTrailingNewline = TRAILING_LINE_BREAK.test(original);
  const lines = original.split(LINE_BREAK);
  if (hadTrailingNewline) lines.pop();

  const located = locateRange(lines, {
    hintLine: lineNumber,
    leadingAnchor,
    trailingAnchor,
    count,
  });
  if (!located.ok) return Result.Error(located.error);

  const { startLine, countAdjustment } = located.data;
  const effectiveCount = count + countAdjustment;
  const endLine = startLine + effectiveCount - 1;

  const trimmed = trimDuplicatedSeams(
    lines,
    startLine,
    endLine,
    splitReplacement(replacement)
  );

  lines.splice(startLine - 1, effectiveCount, ...trimmed.replacementLines);

  let updated = lines.join(newline);
  if (hadTrailingNewline && isNonEmptyArray(lines)) {
    updated += newline;
  }
  try {
    await writeFile(absolutePath, updated, 'utf-8');
  } catch (cause) {
    return Result.Error(describeIoFailure('write to', absolutePath, cause));
  }
  await fileCache.update(absolutePath);

  return Result.Ok(
    {
      startLine,
      linesRemoved: effectiveCount,
      countAdjustment,
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

/**
 * The lines `replacement` carries. A trailing `\n` separates lines rather than
 * starting one, so a lone `\n` — a separator with nothing in front of it —
 * holds no content and deletes the range instead of writing a blank line.
 */
function splitReplacement(replacement: string): string[] {
  if (isEmptyString(replacement) || replacement === '\n') return [];

  const lines = replacement.split(LINE_BREAK);
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
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
