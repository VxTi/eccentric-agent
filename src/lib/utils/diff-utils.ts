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
}

export function generateSideBySideDiff(
  original: string,
  modified: string
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

  // Pad shorter side with empty lines to match length
  while (left.length < right.length) {
    left.push({ value: '' });
  }
  while (right.length < left.length) {
    right.push({ value: '' });
  }

  const sideBySideDiff: DiffLine[][] = [];
  for (let i = 0; i < left.length; i++) {
    sideBySideDiff.push([left[i], right[i]]);
  }

  return sideBySideDiff;
}

export function formatDiffMd(previous: string, current: string): string {
  return `\`\`\`${DIFF_LANG}\n${previous}\n${DIFF_SEPARATOR}\n${current}\n\`\`\`\n`;
}
