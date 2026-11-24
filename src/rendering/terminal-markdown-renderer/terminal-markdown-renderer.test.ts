import { TerminalRenderer } from './terminal-markdown-renderer';
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
  });
});
