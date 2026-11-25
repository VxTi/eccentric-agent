import { TerminalRenderer } from './terminal-markdown-renderer';
import { marked } from 'marked';
import { formatDiffMd } from '../../lib/utils/diff-utils';
import { beforeEach, describe, expect, it } from 'vitest';

describe('TerminalRenderer', () => {
  let renderer: TerminalRenderer;

  beforeEach(() => {
    renderer = new TerminalRenderer({});
  });

  describe('renderDiff', () => {
    it('should render a side-by-side diff correctly', () => {
      const oldContent = 'line 1\nline 2\nline 3';
      const newContent = 'line 1\nline A\nline 3\nline 4';

      const rendered = renderer.renderDiff(oldContent, newContent);
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

      const rendered = renderer.renderDiff(oldContent, newContent);
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

      const rendered = renderer.renderDiff(oldContent, newContent);
      expect(rendered).toMatchInlineSnapshot(`
        "1   line 1                                                                      
        2   line 2                                                                      
        3 - line 3                                                                      
        4 - line 4                                                                      "
      `);
    });
  });

  describe('diff blocks', () => {
    const render = (markdown: string): string =>
      marked.parse(markdown, {
        gfm: true,
        renderer,
        async: false,
      });

    const rowsOf = (rendered: string): string[] =>
      rendered.split('\n').filter(line => line.trim().length > 0);

    it('collapses the unchanged majority of a long file', () => {
      const previous = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
      const oldContent = `${previous.join('\n')}\n`;
      const currentContent = oldContent.replace('line 100', 'line ONE HUNDRED');

      const rows = rowsOf(render(formatDiffMd(oldContent, currentContent)));

      expect(rows).toHaveLength(7);
      expect(rows.join('\n')).toContain('line ONE HUNDRED');
      expect(rows.join('\n')).not.toContain('line 50');
      expect(rows.join('\n')).not.toContain('line 200');
    });

    it('collapses a long file that opens lines with its own code fences', () => {
      const oldContent = [
        '# Title',
        '',
        '```ts',
        'const a = 1;',
        '```',
        ...Array.from({ length: 200 }, (_, i) => `line ${i + 1}`),
      ].join('\n');
      const currentContent = oldContent.replace('const a = 1;', 'const a = 2;');

      // The payload's own fences used to close the diff block early, which made
      // marked fall back to plain text and print both whole files.
      const rows = rowsOf(render(formatDiffMd(oldContent, currentContent)));

      expect(rows).toHaveLength(7);
      expect(rows.join('\n')).toContain('const a = 2;');
      expect(rows.join('\n')).not.toContain('# Title');
      expect(rows.join('\n')).not.toContain('line 200');
    });
  });
});
