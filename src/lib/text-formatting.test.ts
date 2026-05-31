import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  formatPercentageSymbol,
  formatTokenCount,
} from './text-formatting';

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

describe('formatTokenCount', () => {
  it.each`
    count    | formatted
    ${10}    | ${'10'}
    ${1000}  | ${'1K'}
    ${1100}  | ${'1.1K'}
    ${5600}  | ${'5.6K'}
    ${12400} | ${'12K'}
  `(
    'should format token counts correctly',
    ({ count, formatted }: { count: number; formatted: string }) => {
      expect(formatTokenCount(count)).toEqual(formatted);
    },
  );
});

describe('formatPercentageSymbol', () => {
  it.each`
    percentage | symbol
    ${10}      | ${'○'}
    ${20}      | ${'○'}
    ${24}      | ${'○'}
    ${25}      | ${'◔'}
    ${30}      | ${'◔'}
    ${40}      | ${'◔'}
    ${45}      | ${'◔'}
    ${50}      | ${'◑'}
    ${60}      | ${'◑'}
    ${70}      | ${'◑'}
    ${74}      | ${'◑'}
    ${75}      | ${'◕'}
    ${80}      | ${'◕'}
    ${90}      | ${'◕'}
    ${99}      | ${'●'}
    ${100}     | ${'●'}
  `(
    'should produce symbol $symbol from $percentage%',
    ({ symbol, percentage }: { symbol: string; percentage: number }) => {
      expect(formatPercentageSymbol(percentage)).toEqual(symbol);
    }
  );
});
