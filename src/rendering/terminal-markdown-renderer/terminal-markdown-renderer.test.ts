import { beforeEach, describe, expect, it, vi } from 'vitest';
import chalk from 'chalk';
import { highlight as highlightCli } from 'cli-highlight';

// The real module provides the behaviour; the spy only counts invocations so
// the tests can observe whether a re-parse re-runs the highlighter.
vi.mock('cli-highlight', async importOriginal => {
  const actual = await importOriginal<typeof import('cli-highlight')>();
  return { ...actual, highlight: vi.fn(actual.highlight) };
});

import { parseMarkdown } from './markdown-renderer';

const mockedHighlight = vi.mocked(highlightCli);

/**
 * `highlightCode` short-circuits while formatting is disabled, so every test
 * pins `chalk.level` (and restores it) to exercise the highlighting path.
 */
function withFormatting(run: () => void): void {
  const originalLevel = chalk.level;
  chalk.level = 2;
  try {
    run();
  } finally {
    chalk.level = originalLevel;
  }
}

describe('terminal markdown renderer highlight caching', () => {
  beforeEach(() => {
    mockedHighlight.mockClear();
  });

  it('does not re-highlight identical fenced code on a second parse', () => {
    withFormatting(() => {
      const markdown = '```ts\nconst uniqueOne = 1;\n```';

      parseMarkdown(markdown, 80);
      expect(mockedHighlight).toHaveBeenCalledTimes(1);

      // Same content re-arrives verbatim on every terminal resize re-parse.
      parseMarkdown(markdown, 80);
      expect(mockedHighlight).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the highlight cache bounded, evicting the oldest entries', () => {
    withFormatting(() => {
      const block = (i: number) => `\`\`\`ts\nconst evict${i} = ${i};\n\`\`\``;

      parseMarkdown(
        Array.from({ length: 20 }, (_, i) => block(i)).join('\n\n'),
        80
      );
      expect(mockedHighlight).toHaveBeenCalledTimes(20);

      // The sixteen newest entries are still live: re-rendering them alone
      // must not re-highlight anything — and since twenty distinct blocks
      // went in, four must have been evicted, proving the map stays bounded.
      parseMarkdown(
        Array.from({ length: 16 }, (_, i) => block(i + 4)).join('\n\n'),
        80
      );
      expect(mockedHighlight).toHaveBeenCalledTimes(20);

      // The oldest entry was evicted to make room, so it highlights again.
      parseMarkdown(block(0), 80);
      expect(mockedHighlight).toHaveBeenCalledTimes(21);
    });
  });

  it('does not collide identical code fenced in two languages', () => {
    withFormatting(() => {
      const markdown =
        '```ts\nlet shared = 1;\n```\n\n```js\nlet shared = 1;\n```';

      parseMarkdown(markdown, 80);
      expect(mockedHighlight).toHaveBeenCalledTimes(2);
      expect(mockedHighlight.mock.calls[0]?.[1]).toMatchObject({
        language: 'ts',
      });
      expect(mockedHighlight.mock.calls[1]?.[1]).toMatchObject({
        language: 'js',
      });

      // Both cache entries stay live: language is part of the cache key.
      parseMarkdown(markdown, 80);
      expect(mockedHighlight).toHaveBeenCalledTimes(2);
    });
  });

  it('does not cache a failed highlight, so the fallback re-runs', () => {
    withFormatting(() => {
      const markdown = '```ts\nconst boom = 1;\n```';
      const failure = () => {
        throw new Error('unknown language');
      };

      mockedHighlight.mockImplementationOnce(failure);
      const first = parseMarkdown(markdown, 80);
      expect(mockedHighlight).toHaveBeenCalledTimes(1);
      expect(stripAnsi(first)).toContain('const boom = 1;');

      // The fallback was not cached: the next parse re-attempts highlighting.
      mockedHighlight.mockImplementationOnce(failure);
      const second = parseMarkdown(markdown, 80);
      expect(mockedHighlight).toHaveBeenCalledTimes(2);
      expect(stripAnsi(second)).toContain('const boom = 1;');
    });
  });
});

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}
