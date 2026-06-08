import { describe, expect, it } from 'vitest';
import { Ellipsize, ellipsize } from './string-utils';

describe('string ellipsizing', () => {
  it('should ellipsize strings in the start correctly', () => {
    expect(ellipsize('some lengthy string', 8, Ellipsize.START)).toEqual(
      '...tring'
    );
  });

  it('shoud ellipsize strings in the middle correctly', () => {
    const result = ellipsize('some lengthy string', 8, Ellipsize.MIDDLE);
    expect(result).toEqual('some...g');
    expect(result.length).toEqual(8);
  });

  it('should ellipsize strings at the end correctly', () => {
    const result = ellipsize('some lengthy string', 8, Ellipsize.END);

    expect(result).toEqual('some ...');
    expect(result.length).toEqual(8);
  });
});
