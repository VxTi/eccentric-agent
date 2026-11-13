import { isNotNil } from '@vxti/typed';
import { type Change, diffTrimmedLines } from 'diff';
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

export function generateSideBySideDiff(
  original: string,
  modified: string,
  contextLines: number = DEFAULT_CONTEXT_LINES
): SideBySideDiff[] {
  const changes = diffTrimmedLines(original, modified);

  const diffs: SideBySideDiff[] = [];

  let originalLineNumber = 1;
  let modifiedLineNumber = 1;

  changes.forEach((part: Change) => {
    const lines = part.value.split('\n');

    lines.forEach(line => {
      if (part.added) {
        diffs.push([
          { value: '' },
          {
            value: line,
            added: true,
            lineNumberModified: modifiedLineNumber,
          },
        ]);
        modifiedLineNumber++;
      } else if (part.removed) {
        diffs.push([
          {
            value: line,
            removed: true,
            lineNumberOriginal: originalLineNumber,
          },
          { value: '' },
        ]);
        originalLineNumber++;
      } else {
        diffs.push([
          {
            value: line,
            lineNumberOriginal: originalLineNumber,
          },
          {
            value: line,
            lineNumberModified: modifiedLineNumber,
          },
        ]);
        originalLineNumber++;
        modifiedLineNumber++;
      }
    });
  });

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

export function formatDiffMd(previous: string, current: string): string {
  return `\`\`\`${DIFF_LANG}\n${previous}\n${DIFF_SEPARATOR}\n${current}\n\`\`\`\n`;
}
