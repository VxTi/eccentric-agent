import { isNonEmptyString, isNotNil } from '@vxti/typed';
import { supportsLanguage } from 'cli-highlight';
import { diffTrimmedLines } from 'diff';
import { extname } from 'node:path';

export interface DiffLine {
  value: string;
  removed?: boolean;
  added?: boolean;
  lineNumberOriginal?: number;
  lineNumberModified?: number;
  collapsed?: boolean;
}
export type SideBySideDiff = [DiffLine, DiffLine];

const DEFAULT_CONTEXT_LINES = 2;

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
 * The highlighter language for `filePath`'s extension, or undefined when the
 * path has no extension or one highlight.js does not know.
 */
export function diffLanguageForFile(filePath: string): string | undefined {
  const extension = extname(filePath).slice(1);
  return isNonEmptyString(extension) && supportsLanguage(extension)
    ? extension
    : undefined;
}
