import { describe, expect, it } from 'vitest';
import { renderMessageLines } from './markdown-renderer';
import { generateSideBySideDiff, lineCount } from '../../lib/utils/diff-utils';
import {
  MessagePartType,
  type DiffMessagePart,
} from '../../lib/types/messages';

const previous = 'line 1\nline 2\nline 3\n';
const current = 'line 1\nchanged\nline 3\n';

const diffPart: DiffMessagePart = {
  type: MessagePartType.DIFF,
  rows: generateSideBySideDiff(previous, current),
  lineCounts: { previous: lineCount(previous), current: lineCount(current) },
};

describe('renderMessageLines', () => {
  it('renders the diff part below the parsed content', () => {
    const lines = renderMessageLines('Edited `file.ts`', [diffPart], 120);

    expect(lines.join('\n')).toContain('Edited file.ts');
    expect(lines.join('\n')).toContain('2 - line 2');
    expect(lines.join('\n')).toContain('2 + changed');
    expect(lines.filter(line => line === ' ')).toHaveLength(1);
  });

  it('renders nothing without parts', () => {
    const lines = renderMessageLines('plain text', undefined, 120);

    expect(lines.join('\n')).toContain('plain text');
    expect(lines.join('\n')).not.toContain('line 2');
  });

  it('renders nothing when the diff part has no rows', () => {
    const lines = renderMessageLines(
      'plain text',
      [{ ...diffPart, rows: [] }],
      120
    );

    expect(lines.join('\n')).toContain('plain text');
    expect(lines.join('\n')).not.toContain('line 2');
  });

  it('renders text parts below the parsed content', () => {
    const lines = renderMessageLines(
      'headline',
      [{ type: MessagePartType.TEXT, content: '**plain** tail' }],
      120
    );

    expect(lines.join('\n')).toContain('headline');
    expect(lines.join('\n')).toContain('plain');
    expect(lines.join('\n')).toContain('tail');
  });

  it('trims markdown lines but keeps diff rows verbatim', () => {
    const twelveLines = Array.from(
      { length: 12 },
      (_, i) => `line ${i + 1}`
    ).join('\n');
    const wideCurrent = twelveLines.replace('line 6', 'changed');
    const wideDiff: DiffMessagePart = {
      ...diffPart,
      rows: generateSideBySideDiff(twelveLines, wideCurrent),
      lineCounts: {
        previous: lineCount(twelveLines),
        current: lineCount(wideCurrent),
      },
    };

    const lines = renderMessageLines('headline', [wideDiff], 120);
    const diffRows = lines.slice(lines.indexOf('headline') + 1);

    // A markdown line arrives trimmed; a diff row keeps the number column's
    // leading padding, which is what keeps the grid's halves aligned.
    expect(lines[0]).toBe('headline');
    const removedRow = diffRows.find(line => line.includes('- line 6'));
    expect(removedRow).toMatch(/^ 6 - line 6/);
    const changedRow = diffRows.find(line => line.includes('+ changed'));
    expect(changedRow).toContain(' |  6 + changed');
  });
});
