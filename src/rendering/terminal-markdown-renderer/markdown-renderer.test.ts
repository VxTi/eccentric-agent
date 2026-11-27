import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown-renderer';
import { generateSideBySideDiff } from '../../lib/utils/diff-utils';
import type { DiffMessageData } from '../../lib/agent/tools/tool-payload';

const previous = 'line 1\nline 2\nline 3\n';
const current = 'line 1\nchanged\nline 3\n';

const diffData: DiffMessageData = {
  kind: 'diff',
  previous,
  current,
  rows: generateSideBySideDiff(previous, current),
};

describe('parseMarkdown with diff data', () => {
  it('appends the diff grid below the parsed content', () => {
    const rendered = parseMarkdown('Edited `file.ts`', 120, diffData);

    expect(rendered).toContain('Edited file.ts');
    expect(rendered).toContain('2 - line 2');
    expect(rendered).toContain('2 + changed');
  });

  it('renders nothing extra without diff data', () => {
    expect(parseMarkdown('plain text', 120)).not.toContain('line 2');
  });

  it('appends nothing when the payload has no rows', () => {
    const rendered = parseMarkdown('plain text', 120, {
      ...diffData,
      rows: [],
    });

    expect(rendered).not.toContain('line 2');
  });
});
