import { TerminalRenderer } from './terminal-markdown-renderer';
import { buildGithubDarkTheme } from './code-highlight-theme';
import type { SideBySideDiff } from '../../lib/utils/diff-utils';
import chalk, { type ChalkInstance } from 'chalk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('TerminalRenderer', () => {
  let renderer: TerminalRenderer;

  const rowsOf = (rendered: string): string[] =>
    rendered.split('\n').filter(line => line.trim().length > 0);

  beforeEach(() => {
    renderer = new TerminalRenderer({});
  });

  describe('renderDiff', () => {
    it('should render a side-by-side diff correctly', () => {
      const oldContent = 'line 1\nline 2\nline 3';
      const newContent = 'line 1\nline A\nline 3\nline 4';

      const rendered = renderer.renderDiff({
        oldStr: oldContent,
        newStr: newContent,
      });
      expect(rendered).toMatchInlineSnapshot(`
        "1   line 1                             | 1   line 1                            
        2 - line 2                             | 2 + line A                            
        3   line 3                             | 3   line 3                            
                                               | 4 + line 4                            "
      `);
    });

    it('should render additions only as a single-sided diff', () => {
      const oldContent = 'line 1\nline 2';
      const newContent = 'line 1\nline 2\nline 3\nline 4';

      const rendered = renderer.renderDiff({
        oldStr: oldContent,
        newStr: newContent,
      });
      expect(rendered).toMatchInlineSnapshot(`
        "1   line 1                                                                      
        2   line 2                                                                      
        3 + line 3                                                                      
        4 + line 4                                                                      "
      `);
    });

    it('should render removals only as a single-sided diff', () => {
      const oldContent = 'line 1\nline 2\nline 3\nline 4';
      const newContent = 'line 1\nline 2';

      const rendered = renderer.renderDiff({
        oldStr: oldContent,
        newStr: newContent,
      });
      expect(rendered).toMatchInlineSnapshot(`
        "1   line 1                                                                      
        2   line 2                                                                      
        3 - line 3                                                                      
        4 - line 4                                                                      "
      `);
    });

    it('collapses the unchanged majority of a long file', () => {
      const previous = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
      const oldContent = `${previous.join('\n')}\n`;
      const currentContent = oldContent.replace('line 100', 'line ONE HUNDRED');

      const rows = renderer
        .renderDiff({ oldStr: oldContent, newStr: currentContent })
        .split('\n')
        .filter(line => line.trim().length > 0);

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
        renderer.renderDiff({
          oldStr: 'old\n',
          newStr: 'new\n',
          precomputedRows: collapsedRows,
        })
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toContain('—');
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

    const render = (oldStr: string, newStr: string, lang?: string): string =>
      new TerminalRenderer({
        codeHighlighting: { theme: buildGithubDarkTheme() },
      }).renderDiff({ oldStr, newStr, lang });

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
