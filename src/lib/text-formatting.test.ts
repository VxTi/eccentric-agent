import { describe, it, expect } from 'vitest';
import { formatBytes } from './text-formatting';

describe('formatBytes', () => {
  it.each`
    bytes         | formatted
    ${10}         | ${'10 bytes'}
    ${3000}       | ${'2.9KB'}
    ${21000}      | ${'20.5KB'}
    ${544454}     | ${'531.7KB'}
    ${1304000}    | ${'1.2MB'}
    ${23040000}   | ${'22.0MB'}
    ${344404000}  | ${'328.4MB'}
    ${6664404000} | ${'6.2GB'}
  `(
    'should format $bytes into $formatted',
    ({ bytes, formatted }: { bytes: number; formatted: string }) => {
      expect(formatBytes(bytes)).toEqual(formatted);
    }
  );
});
