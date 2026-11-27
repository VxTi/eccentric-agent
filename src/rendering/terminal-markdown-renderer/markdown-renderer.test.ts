import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
import { marked } from 'marked';
import type { TableOptions } from 'cli-table3';
import {
  parseMarkdown,
  renderMessageBlocks,
  renderMessageLines,
  type MessageBlock,
} from './markdown-renderer';
import { TerminalRenderer } from './terminal-markdown-renderer';
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

describe('renderMessageBlocks', () => {
  it('splits content and diff parts into separate blocks', () => {
    const blocks = renderMessageBlocks('Edited `file.ts`', [diffPart], 120);

    expect(blocks).toHaveLength(2);
    expect(linesOf(blocks[0]).join('\n')).toContain('Edited file.ts');
    expect(blocks[1]).toEqual({ kind: 'diff', part: diffPart });
  });

  it('renders text parts as line blocks', () => {
    const blocks = renderMessageBlocks(
      'headline',
      [{ type: MessagePartType.TEXT, content: 'tail' }],
      120
    );

    expect(blocks).toHaveLength(2);
    expect(linesOf(blocks[1]).join('\n')).toContain('tail');
  });

  it('drops diff parts without rows', () => {
    const blocks = renderMessageBlocks(
      'plain text',
      [{ ...diffPart, rows: [] }],
      120
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe('lines');
  });

  it('keeps only the content block without parts', () => {
    const blocks = renderMessageBlocks('plain text', undefined, 120);

    expect(blocks).toHaveLength(1);
    expect(linesOf(blocks[0]).join('\n')).toContain('plain text');
  });
});

function linesOf(block: MessageBlock | undefined): string[] {
  if (block?.kind !== 'lines') throw new Error('expected a lines block');
  return block.lines;
}

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

describe('markdown rendering', () => {
  const tableMarkdown = [
    '| header one | header two |',
    '| --- | --- |',
    '| a fairly long cell value | another fairly long cell value |',
    '| short | a second cell value that is far too long for the column |',
  ].join('\n');

  it('lays table columns out within the terminal width', () => {
    const width = 40;
    const output = parseMarkdown(tableMarkdown, width);
    const tableLines = output.split('\n').filter(line => line.trim() !== '');

    expect(tableLines.length).toBeGreaterThan(0);
    for (const line of tableLines) {
      expect(stripAnsi(line).length).toBeLessThanOrEqual(width);
    }
    // Overflowing cell content is truncated (with the ellipsis) rather than
    // spilling past the column boundary for Ink to hard-wrap mid-cell.
    expect(stripAnsi(output)).toContain('…');
  });

  it('respects explicit tableOptions colWidths', () => {
    const renderer = new TerminalRenderer({
      tableOptions: {
        truncate: '…',
        colWidths: [5, 5],
        rowHeights: [],
        colAligns: [],
        rowAligns: [],
        head: [],
        wordWrap: false,
        wrapOnWordBoundary: false,
      } satisfies TableOptions,
    });

    const output = marked.parse(tableMarkdown, {
      gfm: true,
      renderer,
      async: false,
    });

    // 5 + 5 column widths plus the 3 border characters.
    for (const line of output.split('\n').filter(l => l.trim() !== '')) {
      expect(stripAnsi(line).length).toBeLessThanOrEqual(13);
    }
  });

  it('keeps the code block indentation in rendered blocks', () => {
    const [block] = renderMessageBlocks(
      '```ts\nconst a = 1;\nconst b = 2;\n```',
      undefined,
      80
    );

    const codeLines = linesOf(block).filter(line => line !== ' ');
    expect(codeLines.length).toBeGreaterThan(0);
    for (const line of codeLines) {
      // The renderer indents code blocks by `config.indentation` (2); the
      // lines must no longer have that leading whitespace stripped away.
      expect(line.startsWith('  ')).toBe(true);
    }
    expect(stripAnsi(codeLines.join('\n'))).toContain('const a = 1;');
  });

  it('trims trailing whitespace without disturbing styled code lines', () => {
    const originalLevel = chalk.level;
    chalk.level = 2;
    try {
      const [block] = renderMessageBlocks(
        '```js\nconst a = 1;\nconst b = 2;\n```',
        undefined,
        80
      );

      const codeLines = linesOf(block).filter(line => line !== ' ');
      expect(codeLines.length).toBeGreaterThan(0);
      for (const line of codeLines) {
        // Escape codes are not whitespace: trimEnd must leave them in place.
        expect(line).toContain('\u001b[');
        expect(line.startsWith('  ')).toBe(true);
      }
      expect(stripAnsi(codeLines.join('\n'))).toContain('const a = 1;');
      expect(stripAnsi(codeLines.join('\n'))).toContain('const b = 2;');
    } finally {
      chalk.level = originalLevel;
    }
  });
});

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}
