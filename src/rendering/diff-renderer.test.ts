import { DiffRenderer } from './diff-renderer';
import { buildGithubDarkTheme } from './terminal-markdown-renderer/code-highlight-theme';
import { MessagePartType, type DiffMessagePart } from '../lib/types/messages';
import type { SideBySideDiff } from '../lib/utils/diff-utils';
import chalk, { type ChalkInstance } from 'chalk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WIDTH = 80;

const part = (
  previous: string,
  current: string,
  rows?: SideBySideDiff[],
  language?: string
): DiffMessagePart => ({
  type: MessagePartType.DIFF,
  previous,
  current,
  rows,
  language,
});

describe('DiffRenderer', () => {
  let renderer: DiffRenderer;

  const rowsOf = (rendered: string): string[] =>
    rendered.split('\n').filter(line => line.trim().length > 0);

  beforeEach(() => {
    renderer = new DiffRenderer({}, WIDTH);
  });

  describe('renderDiff', () => {
    it('should render a side-by-side diff correctly', () => {
      const rendered = renderer.renderDiff(
        part('line 1\nline 2\nline 3', 'line 1\nline A\nline 3\nline 4')
      );
      expect(rendered).toMatchInlineSnapshot(`
        "1   line 1                             | 1   line 1                            
        2 - line 2                             | 2 + line A                            
        3   line 3                             | 3   line 3                            
                                               | 4 + line 4                            "
      `);
    });

    it('renders an additions-only diff as a two-column grid with additions on the right', () => {
      const rendered = renderer.renderDiff(
        part('line 1\nline 2', 'line 1\nline 2\nline 3\nline 4')
      );

      for (const row of rowsOf(rendered)) {
        expect(row).toContain(' | ');
      }

      const addedRow = rowsOf(rendered).find(row => row.includes('+ line 3'));
      expect(addedRow).toBeDefined();
      const [oldHalf, newHalf] = addedRow!.split(' | ');
      expect(newHalf).toContain('+ line 3');
      expect(oldHalf!.trim()).toBe('');
    });

    it('renders a removals-only diff as a two-column grid with removals on the left', () => {
      const rendered = renderer.renderDiff(
        part('line 1\nline 2\nline 3\nline 4', 'line 1\nline 2')
      );

      for (const row of rowsOf(rendered)) {
        expect(row).toContain(' | ');
      }

      const removedRow = rowsOf(rendered).find(row => row.includes('- line 3'));
      expect(removedRow).toBeDefined();
      const [oldHalf, newHalf] = removedRow!.split(' | ');
      expect(oldHalf).toContain('- line 3');
      expect(newHalf!.trim()).toBe('');
    });

    it('collapses the unchanged majority of a long file', () => {
      const previous = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
      const oldContent = `${previous.join('\n')}\n`;
      const currentContent = oldContent.replace('line 100', 'line ONE HUNDRED');

      const rows = rowsOf(
        renderer.renderDiff(part(oldContent, currentContent))
      );

      expect(rows).toHaveLength(7);
      expect(rows.join('\n')).toContain('line ONE HUNDRED');
      expect(rows.join('\n')).not.toContain('line 50');
      expect(rows.join('\n')).not.toContain('line 200');
    });

    it('uses the pre-computed rows instead of re-deriving them', () => {
      const collapsedRows: SideBySideDiff[] = [
        [
          { value: '', collapsed: true },
          { value: '', collapsed: true },
        ],
      ];

      const rows = rowsOf(
        renderer.renderDiff(part('old\n', 'new\n', collapsedRows))
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toContain('—');
    });

    it('renders CRLF content without carrying carriage returns into the grid', () => {
      const rendered = renderer.renderDiff(
        part('one\r\ntwo\r\nthree\r\n', 'one\r\nTWO!\r\nthree\r\n')
      );

      expect(rendered).not.toContain('\r');
      expect(rendered).toContain('TWO!');
    });
  });

  describe('diff colours', () => {
    let removedText: ChalkInstance;
    let addedText: ChalkInstance;
    let removedBackground: ChalkInstance;
    let addedBackground: ChalkInstance;
    const originalLevel = chalk.level;

    beforeEach(() => {
      // Chalk builders capture the support level at creation, so the probes
      // must be built after the level is forced to true colour.
      chalk.level = 3;
      removedText = chalk.rgb(248, 81, 73);
      addedText = chalk.rgb(63, 185, 80);
      removedBackground = chalk.bgRgb(55, 28, 33);
      addedBackground = chalk.bgRgb(24, 50, 37);
    });

    afterEach(() => {
      chalk.level = originalLevel;
    });

    // Chalk v5 builders have no `.open`; the opening sequence is recovered by
    // probing the style.
    const openingOf = (style: ChalkInstance): string =>
      style('\u0001').split('\u0001')[0] ?? '';

    const render = (
      previous: string,
      current: string,
      language?: string
    ): string =>
      new DiffRenderer(
        { codeHighlighting: { theme: buildGithubDarkTheme() } },
        WIDTH
      ).renderDiff(part(previous, current, undefined, language));

    it('paints changed rows red and green', () => {
      const rows = rowsOf(render('shared\nold line\n', 'shared\nnew line\n'));
      const changedRow = rows.find(row => row.includes('+ new line'));

      expect(changedRow).toContain(openingOf(removedBackground));
      expect(changedRow).toContain(openingOf(removedText));
      expect(changedRow).toContain(openingOf(addedBackground));
      expect(changedRow).toContain(openingOf(addedText));
    });

    it('leaves unchanged rows unpainted', () => {
      const rows = rowsOf(render('shared\nold line\n', 'shared\nnew line\n'));
      const sharedRow = rows.find(row => row.includes('shared'));

      expect(sharedRow).not.toContain(openingOf(removedBackground));
      expect(sharedRow).not.toContain(openingOf(addedBackground));
    });

    it('keeps syntax colours and recolours plain text for ts content', () => {
      const rows = rowsOf(
        render('shared\nconst a = 1;\n', 'shared\nconst a = 2;\n', 'ts')
      );
      const changedRow = rows.find(row => row.includes('+ '));

      expect(changedRow).toContain(chalk.rgb(255, 123, 114)('const'));
      expect(changedRow).toContain(chalk.rgb(121, 192, 255)('2'));
      expect(changedRow).toContain(openingOf(addedText));
      expect(changedRow).toContain(openingOf(removedText));
    });
  });
});
