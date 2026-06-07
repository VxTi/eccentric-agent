import { TerminalRenderer } from './terminal-markdown-renderer';
import { beforeEach, describe, expect, it } from 'vitest';
import chalk from 'chalk';

describe('TerminalRenderer', () => {
  let renderer: TerminalRenderer;

  beforeEach(() => {
    renderer = new TerminalRenderer({});
  });

  describe('renderDiff', () => {
    it('should render a side-by-side diff correctly', () => {
      const oldContent = 'line 1\nline 2\nline 3';
      const newContent = 'line 1\nline A\nline 3\nline 4';

      const expectedDiff = `${[
        ` ${chalk.dim('1')} line 1    | ${chalk.dim('1')} line 1  `,
        ` ${chalk.dim('2')} ${chalk.bgRed('line 2')}  | ${chalk.dim('2')} ${chalk.bgGreen('line A')}`,
        ` ${chalk.dim('3')} line 3    | ${chalk.dim('3')} line 3  `,
        ` ${chalk.dim(' ')}         | ${chalk.dim('4')} ${chalk.bgGreen('line 4')}`,
      ].join('\n')}\n`;

      const rendered = renderer.renderDiff(oldContent, newContent);
      expect(rendered).toEqual(expectedDiff);
    });
  });
});
