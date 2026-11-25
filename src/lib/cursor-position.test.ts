import { describe, expect, it } from 'vitest';
import { getCursorPosition, moveCursorVertically } from './cursor-position';

describe('getCursorPosition', () => {
  const text = 'ab\ncd';

  it('maps the start of the text to the first line', () => {
    expect(getCursorPosition(text, 0)).toEqual({ line: 0, column: 0 });
  });

  it('maps an offset on the first line', () => {
    expect(getCursorPosition(text, 1)).toEqual({ line: 0, column: 1 });
  });

  it('maps an offset on the newline character to the end of its line', () => {
    expect(getCursorPosition(text, 2)).toEqual({ line: 0, column: 2 });
  });

  it('maps offsets on later lines', () => {
    expect(getCursorPosition(text, 3)).toEqual({ line: 1, column: 0 });
    expect(getCursorPosition(text, 5)).toEqual({ line: 1, column: 2 });
  });

  it('handles empty lines', () => {
    expect(getCursorPosition('a\n\nb', 2)).toEqual({ line: 1, column: 0 });
  });

  it('maps an offset past a trailing newline onto the empty last line', () => {
    expect(getCursorPosition('ab\ncd\n', 6)).toEqual({ line: 2, column: 0 });
  });
});

describe('moveCursorVertically', () => {
  it('moves up while keeping the column', () => {
    expect(moveCursorVertically('ab\ncdef', 6, -1)).toBe(2);
  });

  it('moves down while keeping the column', () => {
    expect(moveCursorVertically('ab\ncdef', 1, 1)).toBe(4);
  });

  it('clamps the column to the target line length', () => {
    expect(moveCursorVertically('abcdef\nab', 4, 1)).toBe(9);
  });

  it('lands on an empty target line', () => {
    expect(moveCursorVertically('ab\n\ncd', 2, 1)).toBe(3);
    expect(moveCursorVertically('ab\n\ncd', 3, 1)).toBe(4);
  });

  it('returns undefined when already on the first line moving up', () => {
    expect(moveCursorVertically('ab\ncd', 1, -1)).toBeUndefined();
  });

  it('returns undefined when already on the last line moving down', () => {
    expect(moveCursorVertically('ab\ncd', 4, 1)).toBeUndefined();
  });

  it('moves off a newline character without getting stuck on it', () => {
    expect(moveCursorVertically('ab\ncd', 2, 1)).toBe(5);
  });

  it('moves across a trailing newline in both directions', () => {
    expect(moveCursorVertically('ab\ncd\n', 5, 1)).toBe(6);
    expect(moveCursorVertically('ab\ncd\n', 6, -1)).toBe(3);
    expect(moveCursorVertically('ab\ncd\n', 5, -1)).toBe(2);
  });

  it('returns undefined for single-line content', () => {
    expect(moveCursorVertically('abc', 1, 1)).toBeUndefined();
    expect(moveCursorVertically('abc', 1, -1)).toBeUndefined();
  });
});
