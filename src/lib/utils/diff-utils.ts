import { hasArrayLength, isNotNil } from '@vxti/typed';
import { diffTrimmedLines } from 'diff';
import {
  DIFF_LANG,
  DIFF_SEPARATOR,
} from '../../rendering/terminal-markdown-renderer/terminal-markdown-renderer';

export interface DiffLine {
  value: string;
  removed?: boolean;
  added?: boolean;
  lineNumberOriginal?: number;
  lineNumberModified?: number;
  collapsed?: boolean;
}
type SideBySideDiff = [DiffLine, DiffLine];

const DEFAULT_CONTEXT_LINES = 2;

/** Shortest fence `formatDiffMd` will emit, and the CommonMark minimum. */
const MIN_DIFF_FENCE_LENGTH = 3;
/** A backtick run that opens a line can close a fenced block. */
const LINE_INITIAL_BACKTICKS = /^ {0,3}(`+)/gm;
/** The breaks `formatDiffMd` spends on keeping the marker on its own line. */
const LEADING_BREAK = /^\r?\n/;
const TRAILING_BREAK = /\r?\n$/;

/**
 * Splits one change part into the lines it covers.
 *
 * Apart from the final part, every part of a line diff carries its own trailing
 * newline, so a plain `split` reports one empty element past the last real line.
 * Treating that as a line would emit a blank row per part and advance both line
 * counters once too often.
 */
function splitPartLines(value: string): string[] {
  const lines = value.split('\n');

  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}

export function generateSideBySideDiff(
  original: string,
  modified: string,
  contextLines: number = DEFAULT_CONTEXT_LINES
): SideBySideDiff[] {
  const changes = diffTrimmedLines(original, modified);

  const diffs: SideBySideDiff[] = [];

  // The two halves of a replacement, awaiting pairing into common rows.
  const removedSide: DiffLine[] = [];
  const addedSide: DiffLine[] = [];

  let originalLineNumber = 1;
  let modifiedLineNumber = 1;

  /**
   * Emits the buffered replacement as aligned rows.
   *
   * The differ reports a changed line as a removed block and an added block.
   * Rendering those as separate rows would place a changed line's new text on a
   * row whose left cell is blank, and its old text on a row whose right cell is
   * blank, so the reader never sees the two variants side by side. Pairing them
   * keeps each modification on one row, padding whichever half is shorter.
   */
  const flushReplacement = (): void => {
    const height = Math.max(removedSide.length, addedSide.length);

    for (let i = 0; i < height; i++) {
      diffs.push([
        removedSide[i] ?? { value: '' },
        addedSide[i] ?? { value: '' },
      ]);
    }

    removedSide.length = 0;
    addedSide.length = 0;
  };

  for (const part of changes) {
    const lines = splitPartLines(part.value);

    if (part.removed) {
      for (const line of lines) {
        removedSide.push({
          value: line,
          removed: true,
          lineNumberOriginal: originalLineNumber++,
        });
      }
      continue;
    }

    if (part.added) {
      for (const line of lines) {
        addedSide.push({
          value: line,
          added: true,
          lineNumberModified: modifiedLineNumber++,
        });
      }
      continue;
    }

    flushReplacement();

    for (const line of lines) {
      diffs.push([
        {
          value: line,
          lineNumberOriginal: originalLineNumber++,
        },
        {
          value: line,
          lineNumberModified: modifiedLineNumber++,
        },
      ]);
    }
  }

  flushReplacement();

  return collapseUnchangedRegions(diffs, contextLines);
}

function collapseUnchangedRegions(
  rows: SideBySideDiff[],
  contextLines: number
): SideBySideDiff[] {
  const isChanged = ([left, right]: SideBySideDiff): boolean => {
    return Boolean(left.added || left.removed || right.added || right.removed);
  };

  const keep = new Array<boolean>(rows.length).fill(false);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (isNotNil(row) && isChanged(row)) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(rows.length - 1, i + contextLines);
      for (let j = start; j <= end; j++) {
        keep[j] = true;
      }
    }
  }

  const hasAnyChange = keep.some(Boolean);
  if (!hasAnyChange) return [];

  const result: SideBySideDiff[] = [];
  let inGap = false;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (keep[i] && isNotNil(row)) {
      result.push(row);
      inGap = false;
    } else if (!inGap) {
      result.push([
        { value: '', collapsed: true },
        { value: '', collapsed: true },
      ]);
      inGap = true;
    }
  }
  return result;
}

/**
 * Serialises a diff for `TerminalRenderer.code`: both sides inside a fenced
 * `diff` block, divided by {@link DIFF_SEPARATOR}.
 *
 * The fence grows past every backtick run that opens a line of either side. A
 * fixed three-backtick fence is closed by the payload itself as soon as the
 * file is Markdown (or otherwise holds a delimiter at the start of a line),
 * and marked then lexes the remainder as ordinary text: the two sides never
 * reach {@link generateSideBySideDiff}, so nothing is collapsed and a one-line
 * edit prints the entire file. That is the bug this guards against.
 */
export function formatDiffMd(previous: string, current: string): string {
  const longestRun = [
    ...`${previous}\n${current}`.matchAll(LINE_INITIAL_BACKTICKS),
  ].reduce((longest, [run]) => Math.max(longest, run.length), 0);
  const fence = '`'.repeat(Math.max(MIN_DIFF_FENCE_LENGTH, longestRun + 1));

  return `${fence}${DIFF_LANG}\n${previous}\n${DIFF_SEPARATOR}\n${current}\n${fence}\n`;
}

/**
 * Recovers the two sides from a {@link formatDiffMd} payload, returning null
 * whenever the text is not a two-sided diff.
 *
 * The breaks that keep the marker alone on its line belong to the envelope, not
 * to either side: left in place they add a blank row at the top of the new side
 * and shift every line number printed beside it by one.
 */
export function splitDiffSides(text: string): [string, string] | null {
  const sides = text.split(DIFF_SEPARATOR);
  if (!hasArrayLength(sides, 2)) return null;

  return [
    sides[0].replace(TRAILING_BREAK, ''),
    sides[1].replace(LEADING_BREAK, ''),
  ];
}
