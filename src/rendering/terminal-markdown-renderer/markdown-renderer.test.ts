import type { TableOptions } from 'cli-table3';
import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
import { marked } from 'marked';
import { isNotNil } from '@vxti/typed';
import {
  diffLines,
  markdownFormattingOptions,
  parseMarkdown,
  renderMessageBlocks,
  renderMessageLines,
  terminalRenderer,
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

const tableMarkdown = [
  '| header one | header two |',
  '| --- | --- |',
  '| a fairly long cell value | another fairly long cell value |',
  '| short | a second cell value that is far too long for the column |',
].join('\n');

describe('markdown rendering', () => {
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

describe('nested lists', () => {
  const twoLevels = [
    '- top one',
    '- top two',
    '  - nested a',
    '  - nested b',
    '- top three',
  ].join('\n');

  const threeLevels = [
    '- one',
    '  - two',
    '    - three a',
    '    - three b',
    '  - two again',
    '- four',
  ].join('\n');

  it('gives a nested item its own bullet, indented under its parent', () => {
    expect(
      renderMessageLines(twoLevels, undefined, 120).map(stripAnsi)
    ).toEqual([
      '• top one',
      '• top two',
      '  • nested a',
      '  • nested b',
      '• top three',
    ]);
  });

  it('indents one level per nesting depth for a three-level list', () => {
    expect(
      renderMessageLines(threeLevels, undefined, 120).map(stripAnsi)
    ).toEqual([
      '• one',
      '  • two',
      '    • three a',
      '    • three b',
      '  • two again',
      '• four',
    ]);
  });

  it('keeps a flat list exactly as it rendered before', () => {
    expect(
      renderMessageLines('- a\n- b\n- c', undefined, 120).map(stripAnsi)
    ).toEqual(['• a', '• b', '• c']);
  });

  it('indents the continuation lines of a multi-line item', () => {
    const lines = renderMessageLines(
      '- line one\n  continued text\n- two',
      undefined,
      120
    ).map(stripAnsi);

    expect(lines).toEqual(['• line one', '  continued text', '• two']);
  });

  it('leaves no blank line between a parent item and its children', () => {
    const lines = renderMessageLines(
      // A loose list: the parent is a paragraph block, so the nested list used
      // to inherit the section padding and land one blank line below it.
      '- top one\n\n- top two\n  - nested a\n  - nested b\n\n- top three',
      undefined,
      120
    ).map(stripAnsi);

    expect(lines).toEqual([
      '• top one',
      '• top two',
      '  • nested a',
      '  • nested b',
      '• top three',
    ]);
    expect(lines).not.toContain(' ');
  });

  it('does not leak the list depth between renders', () => {
    const first = renderMessageLines(twoLevels, undefined, 120).map(stripAnsi);
    const second = renderMessageLines(twoLevels, undefined, 120).map(stripAnsi);

    expect(second).toEqual(first);
  });

  it('releases the list depth when a nested item throws', () => {
    // A render that blows up mid-nesting must leave the depth where it found it,
    // or the next top-level list would be padded as if it were a child.
    const renderer = new TerminalRenderer({
      ...markdownFormattingOptions,
      listitem: (item: string): string => {
        if (item.includes('boom')) throw new Error('boom');
        return `${chalk.cyan('• ')}${item}\n`;
      },
    });
    const parse = (input: string): string =>
      marked.parse(input, { gfm: true, renderer, async: false });

    const before = parse(twoLevels);

    expect(() => parse('- ok\n  - boom\n')).toThrow('boom');

    expect(parse(twoLevels)).toBe(before);
  });
});

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}

describe('resize', () => {
  // Layout constants from src/rendering/diff-renderer.ts (not exported there):
  // a row spends 2*numberWidth + DIFF_COLUMN_OVERHEAD columns on the number
  // columns and separators, and each cell is floored at DIFF_MIN_COL_WIDTH.
  const DIFF_MIN_COL_WIDTH = 10;
  const DIFF_COLUMN_OVERHEAD = 5; // '<num> <cell> | <num> <cell>'

  const diffRowLength = (width: number, numberWidth: number): number => {
    const colWidth = Math.max(
      DIFF_MIN_COL_WIDTH,
      Math.floor((width - 2 * numberWidth - DIFF_COLUMN_OVERHEAD) / 2)
    );
    return 2 * numberWidth + DIFF_COLUMN_OVERHEAD + 2 * colWidth;
  };

  /** The length of the hr rule line among a parse's output lines. */
  const ruleLength = (output: string): number => {
    const rule = output.split('\n').find(line => /^-+$/.test(stripAnsi(line)));
    if (rule === undefined) throw new Error('no hr rule line in output');
    return stripAnsi(rule).length;
  };

  const nonBlankLines = (output: string): string[] =>
    output.split('\n').filter(line => line.trim() !== '');

  it('renders the horizontal rule exactly as wide as the requested width', () => {
    for (const width of [40, 80, 120]) {
      expect(ruleLength(parseMarkdown('---', width)), `width ${width}`).toBe(
        width
      );
    }
  });

  it('renders width-independent content identically at different widths', () => {
    // Paragraphs, list bullets and blockquotes are laid out by Ink, not by the
    // renderer's width — nothing here may couple to the parse-time width.
    const markdown = [
      'A plain paragraph of prose.',
      '',
      '- first bullet',
      '- second bullet',
      '',
      '> quoted wisdom',
    ].join('\n');

    const narrowWidth = 60;
    const wideWidth = 120;
    const narrow = parseMarkdown(markdown, narrowWidth);
    const wide = parseMarkdown(markdown, wideWidth);

    expect(stripAnsi(narrow), 'narrow and wide parses must match').toBe(
      stripAnsi(wide)
    );
  });

  it('lays table columns out within each requested width', () => {
    for (const width of [120, 60, 40]) {
      const tableLines = nonBlankLines(parseMarkdown(tableMarkdown, width));

      expect(tableLines.length, `width ${width}`).toBeGreaterThan(0);
      for (const line of tableLines) {
        expect(
          stripAnsi(line).length,
          `width ${width}: "${stripAnsi(line)}"`
        ).toBeLessThanOrEqual(width);
      }
    }
  });

  it('falls back to intrinsic table width below the column floor', () => {
    // 3 columns need 3 * (MIN_TABLE_COLUMN_WIDTH=3 + 1 border) = 12, so at
    // width 8 `computeColumnWidths` returns undefined and cli-table3 falls
    // back to the table's intrinsic width — wider than the terminal, but
    // structurally intact rather than wrapped into an explosion of lines.
    const threeColumnTable = [
      '| a | b | c |',
      '| --- | --- | --- |',
      '| one | two | three |',
    ].join('\n');
    const width = 8;

    const output = parseMarkdown(threeColumnTable, width);
    const tableLines = nonBlankLines(output);

    expect(tableLines.length, 'the table must still render').toBeGreaterThan(0);
    expect(tableLines.length, 'the table must not explode in line count').toBe(
      5
    );
    expect(stripAnsi(output)).toContain('three');
  });

  it('lays diff rows within the requested width and matches the layout formula', () => {
    // The fixture's line counts are 4/4, so the number column is 1 wide.
    const numberWidth = String(
      Math.max(diffPart.lineCounts.previous, diffPart.lineCounts.current)
    ).length;

    for (const width of [60, 120]) {
      const rows = diffLines(diffPart, width);
      expect(rows.length, `width ${width}`).toBeGreaterThan(0);

      const expectedRowLength = diffRowLength(width, numberWidth);
      expect(
        expectedRowLength,
        `width ${width}: formula must fit the width`
      ).toBeLessThanOrEqual(width);

      for (const row of rows) {
        const visible = stripAnsi(row).length;
        expect(visible, `width ${width}`).toBeLessThanOrEqual(width);
        expect(visible, `width ${width}`).toBe(expectedRowLength);
      }
    }
  });

  it('keeps diff rows legible at the minimum column width floor', () => {
    const numberWidth = String(
      Math.max(diffPart.lineCounts.previous, diffPart.lineCounts.current)
    ).length;
    // Below 2*numberWidth + 2*DIFF_MIN_COL_WIDTH + DIFF_COLUMN_OVERHEAD the
    // cell floor binds, so rows overflow the requested width by design: a
    // readable grid beats a collapsed one.
    const width = 20;
    expect(width).toBeLessThan(
      2 * numberWidth + 2 * DIFF_MIN_COL_WIDTH + DIFF_COLUMN_OVERHEAD
    );

    const rows = diffLines(diffPart, width);
    expect(rows.length).toBeGreaterThan(0);

    const expectedRowLength =
      2 * numberWidth + DIFF_COLUMN_OVERHEAD + 2 * DIFF_MIN_COL_WIDTH;
    for (const row of rows) {
      expect(stripAnsi(row).length).toBe(expectedRowLength);
    }
  });

  it('keeps consecutive parses at different widths independent (narrow first)', () => {
    expect(ruleLength(parseMarkdown('---', 60))).toBe(60);

    // The table right after the narrow hr must reflect the 120 layout: its
    // grid is far wider than the 60-layout could produce.
    const wideLines = nonBlankLines(parseMarkdown(tableMarkdown, 120));
    const widest = Math.max(...wideLines.map(line => stripAnsi(line).length));
    expect(widest).toBeLessThanOrEqual(120);
    expect(widest).toBeGreaterThan(100);

    // And the next narrow parse must not inherit the wide width.
    expect(ruleLength(parseMarkdown('---', 60))).toBe(60);
  });

  it('keeps consecutive parses at different widths independent (wide first)', () => {
    const narrowLines = nonBlankLines(parseMarkdown(tableMarkdown, 60));
    const widest = Math.max(...narrowLines.map(line => stripAnsi(line).length));
    expect(widest).toBeLessThanOrEqual(60);

    expect(ruleLength(parseMarkdown('---', 120))).toBe(120);
  });

  // Two components render side by side and hand the same renderers different
  // widths: a chat message reserves 4 columns for its padding and marker, an
  // input dialog 2 for its border, so their parse widths interleave.
  const CHAT_WIDTH = 120;
  const DIALOG_WIDTH = 60;

  it('keeps interleaved markdown and diff parses at their own widths', () => {
    const numberWidth = String(
      Math.max(diffPart.lineCounts.previous, diffPart.lineCounts.current)
    ).length;

    const dialogRule = ruleLength(parseMarkdown('---', DIALOG_WIDTH));
    const chatDiffRows = diffLines(diffPart, CHAT_WIDTH);
    const chatTable = nonBlankLines(parseMarkdown(tableMarkdown, CHAT_WIDTH));
    const dialogDiffRows = diffLines(diffPart, DIALOG_WIDTH);
    // The dialog re-renders after the wide parses and must not inherit them.
    const dialogRuleAgain = ruleLength(parseMarkdown('---', DIALOG_WIDTH));

    expect(dialogRule).toBe(DIALOG_WIDTH);
    expect(dialogRuleAgain).toBe(DIALOG_WIDTH);

    for (const row of chatDiffRows) {
      expect(stripAnsi(row).length).toBe(
        diffRowLength(CHAT_WIDTH, numberWidth)
      );
    }
    for (const row of dialogDiffRows) {
      expect(stripAnsi(row).length).toBe(
        diffRowLength(DIALOG_WIDTH, numberWidth)
      );
    }

    // The chat table is laid out against its own width, not the dialog's: its
    // grid is wider than the narrow layout could produce.
    const widestChatTableLine = Math.max(
      ...chatTable.map(line => stripAnsi(line).length)
    );
    expect(widestChatTableLine).toBeGreaterThan(DIALOG_WIDTH);
    expect(widestChatTableLine).toBeLessThanOrEqual(CHAT_WIDTH);
  });

  it('falls back to the terminal width for a parse that requests none', () => {
    // A parse must not leave its width behind on the shared renderer: anything
    // that renders without requesting one falls back to the terminal default
    // instead of to whatever the previous component asked for.
    parseMarkdown('---', 40);

    const rule = ruleLength(
      marked.parse('---', {
        gfm: true,
        renderer: terminalRenderer,
        async: false,
      })
    );

    // Mirrors the renderer's fallback: `columns` is undefined whenever stdout
    // is not a TTY.
    const { columns } = process.stdout;
    expect(rule).toBe(isNotNil(columns) && columns > 0 ? columns : 80);
  });
});
