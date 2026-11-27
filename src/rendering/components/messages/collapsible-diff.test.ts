import { describe, expect, it } from 'vitest';
import { collapseDiffLines } from './collapsible-diff';

describe('collapseDiffLines', () => {
  it('keeps lines that fit the budget whole', () => {
    const result = collapseDiffLines(['a', 'b', 'c'], 3);

    expect(result).toEqual({ visible: ['a', 'b', 'c'], hiddenCount: 0 });
  });

  it('keeps the first lines and reports the hidden tail', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `row ${i + 1}`);
    const result = collapseDiffLines(lines, 8);

    expect(result.visible).toEqual(lines.slice(0, 8));
    expect(result.hiddenCount).toBe(4);
  });
});
