import { diffLines, type Change } from 'diff';
import {
  DIFF_LANG,
  DIFF_SEPARATOR,
} from '../../rendering/terminal-renderer/terminal-markdown-renderer';

export interface DiffLine {
  value: string;
  removed?: boolean;
  added?: boolean;
  lineNumberOriginal?: number;
  lineNumberModified?: number;
  collapsed?: boolean;
}

const DEFAULT_CONTEXT_LINES = 3;

export function generateSideBySideDiff(
  original: string,
  modified: string,
  contextLines: number = DEFAULT_CONTEXT_LINES
): DiffLine[][] {
  const changes = diffLines(original, modified);

  const left: DiffLine[] = [];
  const right: DiffLine[] = [];

  let originalLineNumber = 1;
  let modifiedLineNumber = 1;

  changes.forEach((part: Change) => {
    const lines = part.value
      .split('\n')
      .filter(line => line.length > 0 || part.value.endsWith('\n'));

    lines.forEach(line => {
      if (part.added) {
        right.push({
          value: line,
          added: true,
          lineNumberModified: modifiedLineNumber,
        });
        left.push({
          value: '',
        });
        modifiedLineNumber++;
      } else if (part.removed) {
        left.push({
          value: line,
          removed: true,
          lineNumberOriginal: originalLineNumber,
        });
        right.push({
          value: '',
        });
        originalLineNumber++;
      } else {
        left.push({
          value: line,
          lineNumberOriginal: originalLineNumber,
        });
        right.push({
          value: line,
          lineNumberModified: modifiedLineNumber,
        });
        originalLineNumber++;
        modifiedLineNumber++;
      }
    });
  });

  while (left.length < right.length) {
    left.push({ value: '' });
  }
  while (right.length < left.length) {
    right.push({ value: '' });
  }

  const rows: DiffLine[][] = [];
  for (let i = 0; i < left.length; i++) {
    rows.push([left[i], right[i]]);
  }

  return collapseUnchangedRegions(rows, contextLines);
}

function collapseUnchangedRegions(
  rows: DiffLine[][],
  contextLines: number
): DiffLine[][] {
  const isChanged = (row: DiffLine[]): boolean => {
    const [l, r] = row;
    return Boolean(l?.added || l?.removed || r?.added || r?.removed);
  };

  const keep = new Array<boolean>(rows.length).fill(false);
  for (let i = 0; i < rows.length; i++) {
    if (isChanged(rows[i]!)) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(rows.length - 1, i + contextLines);
      for (let j = start; j <= end; j++) {
        keep[j] = true;
      }
    }
  }

  const hasAnyChange = keep.some(Boolean);
  if (!hasAnyChange) return [];

  const result: DiffLine[][] = [];
  let inGap = false;
  for (let i = 0; i < rows.length; i++) {
    if (keep[i]) {
      result.push(rows[i]!);
      inGap = false;
    } else if (!inGap) {
      result.push([{ value: '', collapsed: true }, { value: '', collapsed: true }]);
      inGap = true;
    }
  }
  return result;
}

export function formatDiffMd(previous: string, current: string): string {
  return `\`\`\`${DIFF_LANG}\n${previous}\n${DIFF_SEPARATOR}\n${current}\n\`\`\`\n`;
}
