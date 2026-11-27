import { describe, expect, it } from 'vitest';
import { renderMessageContent } from './markdown-renderer';
import { generateSideBySideDiff } from '../../lib/utils/diff-utils';
import {
  MessagePartType,
  type DiffMessagePart,
} from '../../lib/types/messages';

const previous = 'line 1\nline 2\nline 3\n';
const current = 'line 1\nchanged\nline 3\n';

const diffPart: DiffMessagePart = {
  type: MessagePartType.DIFF,
  previous,
  current,
  rows: generateSideBySideDiff(previous, current),
};

describe('renderMessageContent with parts', () => {
  it('appends the diff part below the parsed content', () => {
    const rendered = renderMessageContent('Edited `file.ts`', [diffPart], 120);

    expect(rendered).toContain('Edited file.ts');
    expect(rendered).toContain('2 - line 2');
    expect(rendered).toContain('2 + changed');
  });

  it('renders nothing extra without parts', () => {
    expect(renderMessageContent('plain text', undefined, 120)).not.toContain(
      'line 2'
    );
  });

  it('appends nothing when the diff part has no rows', () => {
    const rendered = renderMessageContent(
      'plain text',
      [{ ...diffPart, rows: [] }],
      120
    );

    expect(rendered).not.toContain('line 2');
  });

  it('renders text parts below the parsed content', () => {
    const rendered = renderMessageContent(
      'headline',
      [{ type: MessagePartType.TEXT, content: '**plain** tail' }],
      120
    );

    expect(rendered).toContain('headline');
    expect(rendered).toContain('plain');
    expect(rendered).toContain('tail');
  });
});
