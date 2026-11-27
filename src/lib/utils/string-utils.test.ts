import { describe, expect, it } from 'vitest';
import { Position, ellipsize, levenshteinDistance } from './string-utils';

describe('string ellipsizing', () => {
  it('should ellipsize strings in the start correctly', () => {
    expect(ellipsize('some lengthy string', 8, Position.START)).toEqual(
      '...tring'
    );
  });

  it('shoud ellipsize strings in the middle correctly', () => {
    const result = ellipsize('some lengthy string', 8, Position.MIDDLE);
    expect(result).toEqual('some...g');
    expect(result.length).toEqual(8);
  });

  it('should ellipsize strings at the end correctly', () => {
    const result = ellipsize('some lengthy string', 8, Position.END);

    expect(result).toEqual('some ...');
    expect(result.length).toEqual(8);
  });
});

describe('levenshteinDistance', () => {
  it('counts single-character edits', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('same', 'same')).toBe(0);
  });

  it('is symmetric', () => {
    expect(levenshteinDistance('flaw', 'lawn')).toBe(
      levenshteinDistance('lawn', 'flaw')
    );
  });
});
