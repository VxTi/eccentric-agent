import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type ErrorResult,
  type Result,
  type SuccessResult,
} from '../../../../result';
import { store, setCwd } from '../../../../state';
import { NotifierChannel } from '../../../../events/notifier';
import type { ToolChannelParams } from '../../tool-definition';
import { parseMarkdown } from '../../../../../rendering/terminal-markdown-renderer/markdown-renderer';
import { readFile } from './read-file';
import { replaceInFile } from './replace-in-file';

const FIXTURE_LINES = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);

const channel = new NotifierChannel<ToolChannelParams>('test', () => {});
const signal = new AbortController().signal;

let tmpDir: string;
let counter = 0;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'replace-in-file-test-'));
  store.dispatch(setCwd(tmpDir));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Unwraps a result after asserting success, so tests stay free of branches.
 * A failed expectation aborts the test before the cast is ever evaluated.
 */
function expectOk<T, M>(result: Result<T, string, M>): SuccessResult<T, M> {
  expect(result.ok).toBe(true);
  return result as SuccessResult<T, M>;
}

function expectError(result: Result<any, any, any>): string {
  expect(result.ok).toBe(false);
  return (result as ErrorResult<string, string>).error;
}

/** Fresh fixture per test; a read is required first so the file cache is warm. */
async function prepareFixture(): Promise<string> {
  const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
  await fs.writeFile(filePath, `${FIXTURE_LINES.join('\n')}\n`, 'utf-8');
  expectOk(await readFile.handle({ filePath }, channel, signal));
  return filePath;
}

/**
 * Same as {@link prepareFixture}, but with a stable file name: tests that feed
 * `basename(filePath)` into a snapshot must not churn when other tests are
 * added and the shared counter shifts.
 */
async function prepareNamedFixture(fileName: string): Promise<string> {
  const filePath = path.join(tmpDir, fileName);
  await fs.writeFile(filePath, `${FIXTURE_LINES.join('\n')}\n`, 'utf-8');
  expectOk(await readFile.handle({ filePath }, channel, signal));
  return filePath;
}

/** Fixture with an explicit line list, so a test can repeat anchor content. */
async function prepareLines(...lines: string[]): Promise<string> {
  const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
  await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf-8');
  return filePath;
}

async function readLines(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  return content.split('\n');
}

/** The temp directory differs per run, so it never belongs in a snapshot. */
function snapshotable<T extends { filePath: string }>(data: T): T {
  return { ...data, filePath: path.basename(data.filePath) };
}

describe('replace_in_file', () => {
  it('applies a plain replacement without repair', async () => {
    const filePath = await prepareNamedFixture('plain-replacement.txt');

    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 5, leadingAnchor: 'line 5', count: 1 },
          replacement: 'REPLACED',
        },
        channel,
        signal
      )
    );

    expect(result.data.duplicatesRemoved).toBe(0);
    expect(snapshotable(result.data)).toMatchSnapshot();

    const lines = await readLines(filePath);
    expect(lines[4]).toBe('REPLACED');
    expect(lines).toEqual([
      'line 1',
      'line 2',
      'line 3',
      'line 4',
      'REPLACED',
      'line 6',
      'line 7',
      'line 8',
      'line 9',
      'line 10',
      '',
    ]);
    expect(await fs.readFile(filePath, 'utf-8')).toMatchSnapshot();
  });

  it('keeps the documented insert pattern (anchor re-included in replacement) untouched', async () => {
    const filePath = await prepareFixture();

    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 5, leadingAnchor: 'line 5', count: 1 },
          replacement: 'line 5\nINSERTED',
        },
        channel,
        signal
      )
    );

    expect(result.data.duplicatesRemoved).toBe(0);

    const lines = await readLines(filePath);
    expect(lines.slice(3, 7)).toEqual([
      'line 4',
      'line 5',
      'INSERTED',
      'line 6',
    ]);
  });

  it('drops leading replacement lines duplicating the line above the range', async () => {
    const filePath = await prepareFixture();

    // Diff-hunk style slip: the model includes the preceding context line.
    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 5, leadingAnchor: 'line 5', count: 1 },
          replacement: 'line 4\nNEW',
        },
        channel,
        signal
      )
    );

    expect(result.data.duplicatesRemoved).toBe(1);
    expect(result.data.duplicatedSeamLines).toEqual(['line 4']);

    const lines = await readLines(filePath);
    expect(lines).toEqual([
      'line 1',
      'line 2',
      'line 3',
      'line 4',
      'NEW',
      'line 6',
      'line 7',
      'line 8',
      'line 9',
      'line 10',
      '',
    ]);
  });

  it('drops trailing replacement lines duplicating the line below the range', async () => {
    const filePath = await prepareFixture();

    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 5, leadingAnchor: 'line 5', count: 2 },
          replacement: 'NEW A\nNEW B\nline 7',
        },
        channel,
        signal
      )
    );

    expect(result.data.duplicatesRemoved).toBe(1);

    const lines = await readLines(filePath);
    expect(lines.slice(3, 8)).toEqual([
      'line 4',
      'NEW A',
      'NEW B',
      'line 7',
      'line 8',
    ]);
  });

  it('trims multiple duplicated context lines on both seams', async () => {
    const filePath = await prepareFixture();

    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 5, leadingAnchor: 'line 5', count: 1 },
          replacement: 'line 3\nline 4\nNEW\nline 6',
        },
        channel,
        signal
      )
    );

    expect(result.data.duplicatesRemoved).toBe(3);
    expect(result.data.duplicatedSeamLines).toEqual([
      'line 3',
      'line 4',
      'line 6',
    ]);
    const lines = await readLines(filePath);
    expect(lines.slice(2, 6)).toEqual(['line 3', 'line 4', 'NEW', 'line 6']);
  });

  it('skips the repair when every replacement line would be trimmed', async () => {
    const filePath = await prepareFixture();

    // A single line duplicating the neighbor is ambiguous: trimming it would
    // silently turn the edit into a deletion, so the input is kept verbatim.
    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 5, leadingAnchor: 'line 5', count: 1 },
          replacement: 'line 4',
        },
        channel,
        signal
      )
    );

    expect(result.data.duplicatesRemoved).toBe(0);
    expect(result.data.duplicatedSeamLines).toEqual([]);
    const lines = await readLines(filePath);
    expect(lines.slice(3, 6)).toEqual(['line 4', 'line 4', 'line 6']);
  });

  it('does not trim when the duplicate match would cross into the removed range', async () => {
    const filePath = await prepareFixture();

    // The anchor pattern with count > 1: replacement re-includes the removed
    // range itself, which is harmless and must not be trimmed from the seam
    // side (line 4 sits below the removed range [6, 7], not adjacent).
    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 6, leadingAnchor: 'line 6', count: 2 },
          replacement: 'line 6\nline 7',
        },
        channel,
        signal
      )
    );

    expect(result.data.duplicatesRemoved).toBe(0);

    const lines = await readLines(filePath);
    expect(lines.slice(4, 8)).toEqual(['line 5', 'line 6', 'line 7', 'line 8']);
  });

  it('does not trim seams made only of punctuation or blank lines', async () => {
    const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
    await fs.writeFile(filePath, 'if (a) {\n  x();\n}\n', 'utf-8');

    // Wrapping `x()` in a new block legitimately ends with `}` before `}`.
    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 2, leadingAnchor: '  x();', count: 1 },
          replacement: '  if (b) {\n    x();\n  }',
        },
        channel,
        signal
      )
    );

    expect(result.data.duplicatesRemoved).toBe(0);
  });

  describe('leading anchor resolution', () => {
    it('relocates to the leading anchor when earlier edits shifted line numbers', async () => {
      const filePath = await prepareFixture();

      await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 2, leadingAnchor: 'line 2', count: 1 },
          replacement: 'line 2\nA\nB',
        },
        channel,
        signal
      );

      // Second edit still uses line numbers from the original read.
      const second = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: { lineNumber: 7, leadingAnchor: 'line 7', count: 2 },
            replacement: 'SEVEN\nEIGHT',
          },
          channel,
          signal
        )
      );

      expect(second.data.startLine).toBe(9);
      expect(await readLines(filePath)).toEqual([
        'line 1',
        'line 2',
        'A',
        'B',
        'line 3',
        'line 4',
        'line 5',
        'line 6',
        'SEVEN',
        'EIGHT',
        'line 9',
        'line 10',
        '',
      ]);
    });

    it('accepts edits after the file changed on disk', async () => {
      const filePath = await prepareFixture();
      await fs.writeFile(
        filePath,
        `external\n${FIXTURE_LINES.join('\n')}\n`,
        'utf-8'
      );

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: { lineNumber: 3, leadingAnchor: 'line 3', count: 1 },
            replacement: 'THREE',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(4);
      expect((await readLines(filePath)).slice(0, 5)).toEqual([
        'external',
        'line 1',
        'line 2',
        'THREE',
        'line 4',
      ]);
    });

    it('rejects a repeated edit whose leading anchor no longer exists', async () => {
      const filePath = await prepareFixture();
      const input = {
        filePath,
        range: { lineNumber: 5, leadingAnchor: 'line 5', count: 1 },
        replacement: 'FIVE',
      };

      expectOk(await replaceInFile.handle(input, channel, signal));
      const before = await fs.readFile(filePath, 'utf-8');

      const retry = await replaceInFile.handle(input, channel, signal);

      expect(retry.ok).toBe(false);
      expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
    });

    it('falls back to whitespace-insensitive matching', async () => {
      const filePath = await prepareFixture();

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: { lineNumber: 4, leadingAnchor: '  line 6  ', count: 1 },
            replacement: 'SIX',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(6);
    });

    it('picks the nearest of several matching lines', async () => {
      const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
      await fs.writeFile(filePath, 'x\na\nx\nb\nc\nd\nx\n', 'utf-8');

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: { lineNumber: 6, leadingAnchor: 'x', count: 1 },
            replacement: 'Y',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(7);
    });

    it('rejects when two matches are equally near', async () => {
      const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
      await fs.writeFile(filePath, 'x\na\nx\n', 'utf-8');

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 2, leadingAnchor: 'x', count: 1 },
          replacement: 'Y',
        },
        channel,
        signal
      );

      expect(result.ok).toBe(false);
    });

    it('rejects a relocated range that runs past the end of the file', async () => {
      const filePath = await prepareFixture();

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 1, leadingAnchor: 'line 9', count: 3 },
          replacement: 'Z',
        },
        channel,
        signal
      );

      expect(result.ok).toBe(false);
    });

    it('rejects an ambiguous range instead of editing the farther match that fits', async () => {
      // `x` matches lines 1 and 3, equally near the hinted line 2. The original
      // behavior rejected this as ambiguous before any range-length check; it
      // must not quietly fall back to editing the range that happens to fit.
      const filePath = await prepareLines('x', 'a', 'x');
      const before = await fs.readFile(filePath, 'utf-8');

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 2, leadingAnchor: 'x', count: 2 },
          replacement: 'Y',
        },
        channel,
        signal
      );

      expect(expectError(result)).toContain('ambiguous');
      expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
    });

    it('rejects the nearest leading match that overruns instead of editing a farther match that fits', async () => {
      const filePath = await prepareLines('x', 'a', 'x', 'b');
      const before = await fs.readFile(filePath, 'utf-8');

      // The nearest `x` is line 3, whose 3-line range runs past the end of the
      // 4-line file; the original behavior chose it first and then rejected,
      // rather than falling back to the farther match on line 1.
      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 4, leadingAnchor: 'x', count: 3 },
          replacement: 'Y',
        },
        channel,
        signal
      );

      expect(expectError(result)).toContain('exceeds file length');
      expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
    });

    it('ignores a copied read_file line-number prefix in the leading anchor', async () => {
      const filePath = await prepareFixture();

      await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 5, leadingAnchor: ' 5\tline 5', count: 1 },
          replacement: 'FIVE',
        },
        channel,
        signal
      );

      expect((await readLines(filePath))[4]).toBe('FIVE');
    });

    it('rescues a leading anchor whose copied read_file prefix is stale', async () => {
      const filePath = await prepareFixture();

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: { lineNumber: 5, leadingAnchor: '4\tline 5', count: 1 },
            replacement: 'FIVE',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(5);
      expect((await readLines(filePath))[4]).toBe('FIVE');
    });

    it('prefers an exact raw leading anchor at the hinted line over stripping its read_file prefix', async () => {
      // `2\tb` is both the literal content of line 2 and a well-formed copy of
      // a `read_file` line holding `b`. Stripping the prefix first would treat
      // the anchor as a stale prefix and relocate the edit to the unrelated
      // `b` on line 1; the raw match at the hinted line has to win instead.
      const filePath = await prepareLines('b', '2\tb', 'c');

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: { lineNumber: 2, leadingAnchor: '2\tb', count: 1 },
            replacement: 'TWO-B',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(2);
      expect(await fs.readFile(filePath, 'utf-8')).toBe('b\nTWO-B\nc\n');
    });

    it('does not rescue a stale prefix that strips to a blank leading anchor', async () => {
      const filePath = await prepareFixture();

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 5, leadingAnchor: '4\t', count: 1 },
          replacement: 'FIVE',
        },
        channel,
        signal
      );

      expect(result.ok).toBe(false);
    });

    it('does not rescue when the stripped leading anchor matches more than one line', async () => {
      const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
      await fs.writeFile(filePath, 'x\na\nx\n', 'utf-8');

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 1, leadingAnchor: '9\tx', count: 1 },
          replacement: 'Y',
        },
        channel,
        signal
      );

      expect(result.ok).toBe(false);
    });

    it('anchors on the first line of a multi-line leading anchor', async () => {
      const filePath = await prepareFixture();

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: { lineNumber: 3, leadingAnchor: 'line 5\nline 6', count: 2 },
            replacement: 'FIVE\nSIX',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(5);
    });

    it('matches a blank leading anchor against a whitespace-only hinted line', async () => {
      const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
      await fs.writeFile(filePath, 'a\n    \nb\n', 'utf-8');

      await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 2, leadingAnchor: '', count: 1 },
          replacement: 'X',
        },
        channel,
        signal
      );

      expect(await fs.readFile(filePath, 'utf-8')).toBe('a\nX\nb\n');
    });

    it('reports an out-of-range hint when a blank leading anchor cannot match', async () => {
      const filePath = await prepareFixture();

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 99, leadingAnchor: '', count: 1 },
          replacement: 'X',
        },
        channel,
        signal
      );

      expect(expectError(result)).toContain('out of range');
    });

    it('numbers lines like read_file in files with mixed line endings', async () => {
      const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
      await fs.writeFile(filePath, 'one\r\ntwo\nthree\nfour\r\n', 'utf-8');

      const read = expectOk(
        await readFile.handle({ filePath }, channel, signal)
      );
      expect(read.data.content).toContain('3\tthree');

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: { lineNumber: 3, leadingAnchor: 'three', count: 1 },
            replacement: 'THREE',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(3);
      expect(await fs.readFile(filePath, 'utf-8')).toBe(
        'one\r\ntwo\r\nTHREE\r\nfour\r\n'
      );
    });
  });

  describe('trailing anchor', () => {
    it('validates the line the range is claimed to close on', async () => {
      const filePath = await prepareLines('x();', 'a();', 'b();');

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: {
              lineNumber: 1,
              leadingAnchor: 'x();',
              trailingAnchor: 'a();',
              count: 2,
            },
            replacement: 'NEW A\nNEW B',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(1);
      expect(await readLines(filePath)).toEqual(['NEW A', 'NEW B', 'b();', '']);
    });

    it('relocates past a nearer copy of the leading anchor that the trailing endpoint rejects', async () => {
      // The hint names line 1, whose range closes on `a();`. Only the second
      // copy of `x();` closes on `b();`, which is the range the endpoints
      // describe, so the edit has to move down to line 3.
      const filePath = await prepareLines(
        'x();',
        'a();',
        'x();',
        'b();',
        'c();'
      );

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: {
              lineNumber: 1,
              leadingAnchor: 'x();',
              trailingAnchor: 'b();',
              count: 2,
            },
            replacement: 'NEW A\nNEW B',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(3);
      expect(await readLines(filePath)).toEqual([
        'x();',
        'a();',
        'NEW A',
        'NEW B',
        'c();',
        '',
      ]);

      // The same edit without the trailing endpoint: the nearer copy wins, which
      // is the wrong range the trailing anchor exists to prevent.
      const unanchored = await prepareLines(
        'x();',
        'a();',
        'x();',
        'b();',
        'c();'
      );
      const withoutTrailing = expectOk(
        await replaceInFile.handle(
          {
            filePath: unanchored,
            range: { lineNumber: 1, leadingAnchor: 'x();', count: 2 },
            replacement: 'NEW A\nNEW B',
          },
          channel,
          signal
        )
      );

      expect(withoutTrailing.data.startLine).toBe(1);
    });

    it('decides between two leading matches that are equally near the hint', async () => {
      const filePath = await prepareLines('x();', 'a();', 'x();', 'b();');

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: {
              lineNumber: 2,
              leadingAnchor: 'x();',
              trailingAnchor: 'b();',
              count: 2,
            },
            replacement: 'NEW A\nNEW B',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(3);
    });

    it('rejects an ambiguous pair of ranges that both endpoints support', async () => {
      const filePath = await prepareLines('x();', 'b();', 'x();', 'b();');
      const before = await fs.readFile(filePath, 'utf-8');

      const result = await replaceInFile.handle(
        {
          filePath,
          range: {
            lineNumber: 2,
            leadingAnchor: 'x();',
            trailingAnchor: 'b();',
            count: 2,
          },
          replacement: 'NEW',
        },
        channel,
        signal
      );

      expect(expectError(result)).toContain('ambiguous');
      expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
    });

    it('rejects without writing when the trailing endpoint disagrees', async () => {
      const filePath = await prepareLines('x();', 'a();', 'x();', 'b();');
      const before = await fs.readFile(filePath, 'utf-8');

      const result = await replaceInFile.handle(
        {
          filePath,
          range: {
            lineNumber: 1,
            leadingAnchor: 'x();',
            trailingAnchor: 'zz();',
            count: 2,
          },
          replacement: 'NEW',
        },
        channel,
        signal
      );

      expect(expectError(result)).toContain('disagree');
      expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
    });

    it('rejects a `count` that stops short of the trailing anchor', async () => {
      const filePath = await prepareLines('x();', 'a();', 'b();');
      const before = await fs.readFile(filePath, 'utf-8');

      // `trailingAnchor` names line 3 while `count` closes the range on line 1:
      // the endpoints cannot both be right, so nothing may be written.
      const result = await replaceInFile.handle(
        {
          filePath,
          range: {
            lineNumber: 1,
            leadingAnchor: 'x();',
            trailingAnchor: 'b();',
            count: 1,
          },
          replacement: 'NEW',
        },
        channel,
        signal
      );

      expect(expectError(result)).toContain('disagree');
      expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
    });

    it('tolerates whitespace and a copied read_file prefix in the trailing anchor', async () => {
      const filePath = await prepareLines('x();', '  a();');

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: {
              lineNumber: 1,
              leadingAnchor: 'x();',
              trailingAnchor: '9\t  a();',
              count: 2,
            },
            replacement: 'NEW A\nNEW B',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(1);
      expect(await readLines(filePath)).toEqual(['NEW A', 'NEW B', '']);
    });

    it('ignores a blank trailing anchor, which carries no evidence', async () => {
      const filePath = await prepareLines('x();', 'a();');

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: {
              lineNumber: 1,
              leadingAnchor: 'x();',
              trailingAnchor: '   ',
              count: 1,
            },
            replacement: 'NEW',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(1);
      expect(await readLines(filePath)).toEqual(['NEW', 'a();', '']);
    });

    it('relocates a range whose two endpoints both moved down the file', async () => {
      const filePath = await prepareLines('inserted', ...FIXTURE_LINES);

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: {
              lineNumber: 5,
              leadingAnchor: 'line 5',
              trailingAnchor: 'line 6',
              count: 2,
            },
            replacement: 'FIVE\nSIX',
          },
          channel,
          signal
        )
      );

      expect(result.data.startLine).toBe(6);
      expect((await readLines(filePath)).slice(4, 9)).toEqual([
        'line 4',
        'FIVE',
        'SIX',
        'line 7',
        'line 8',
      ]);
    });

    it('reports a clear overrun when the trailing anchor leaves no fitting range', async () => {
      const filePath = await prepareLines('x();', 'a();');
      const before = await fs.readFile(filePath, 'utf-8');

      // No range starting at the leading match can fit `count` 5 in a 2-line
      // file, so the edit is rejected with the file-length error.
      const result = await replaceInFile.handle(
        {
          filePath,
          range: {
            lineNumber: 1,
            leadingAnchor: 'x();',
            trailingAnchor: 'a();',
            count: 5,
          },
          replacement: 'NEW',
        },
        channel,
        signal
      );

      expect(expectError(result)).toContain('exceeds file length');
      expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
    });

    describe('count off-by-one tolerance', () => {
      it('grows the range when the trailing anchor sits one line past the claimed end', async () => {
        const filePath = await prepareLines('x();', 'a();', 'b();', 'c();');

        const result = expectOk(
          await replaceInFile.handle(
            {
              filePath,
              range: {
                lineNumber: 1,
                leadingAnchor: 'x();',
                trailingAnchor: 'c();',
                count: 3,
              },
              replacement: 'NEW',
            },
            channel,
            signal
          )
        );

        expect(result.data.startLine).toBe(1);
        expect(result.data.linesRemoved).toBe(4);
        expect(result.data.countAdjustment).toBe(1);
        expect(await readLines(filePath)).toEqual(['NEW', '']);
      });

      it('shrinks the range when the trailing anchor sits one line inside the claimed end', async () => {
        const filePath = await prepareLines('x();', 'a();', 'b();', 'c();');

        const result = expectOk(
          await replaceInFile.handle(
            {
              filePath,
              range: {
                lineNumber: 1,
                leadingAnchor: 'x();',
                trailingAnchor: 'b();',
                count: 4,
              },
              replacement: 'NEW',
            },
            channel,
            signal
          )
        );

        expect(result.data.startLine).toBe(1);
        expect(result.data.linesRemoved).toBe(3);
        expect(result.data.countAdjustment).toBe(-1);
        expect(await readLines(filePath)).toEqual(['NEW', 'c();', '']);
      });

      it('rejects when the trailing anchor agrees one line either side of the claimed end', async () => {
        const filePath = await prepareLines('x();', 'a();', 'b();', 'a();');
        const before = await fs.readFile(filePath, 'utf-8');

        const result = await replaceInFile.handle(
          {
            filePath,
            range: {
              lineNumber: 1,
              leadingAnchor: 'x();',
              trailingAnchor: 'a();',
              count: 3,
            },
            replacement: 'NEW',
          },
          channel,
          signal
        );

        expect(expectError(result)).toContain('ambiguous');
        expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
      });

      it('prefers an exactly corroborated range over a hinted range that only an inferred span supports', async () => {
        const filePath = await prepareLines(
          'x();',
          'a();',
          'd();',
          'x();',
          'd();'
        );

        const result = expectOk(
          await replaceInFile.handle(
            {
              filePath,
              range: {
                lineNumber: 1,
                leadingAnchor: 'x();',
                trailingAnchor: 'd();',
                count: 2,
              },
              replacement: 'NEW',
            },
            channel,
            signal
          )
        );

        expect(result.data.startLine).toBe(4);
        expect(result.data.countAdjustment).toBe(0);
        expect(await readLines(filePath)).toEqual([
          'x();',
          'a();',
          'd();',
          'NEW',
          '',
        ]);
      });

      it('rescues a one-line overrun when the trailing anchor names the last line', async () => {
        const filePath = await prepareLines('x();', 'a();');

        const result = expectOk(
          await replaceInFile.handle(
            {
              filePath,
              range: {
                lineNumber: 1,
                leadingAnchor: 'x();',
                trailingAnchor: 'a();',
                count: 3,
              },
              replacement: 'NEW',
            },
            channel,
            signal
          )
        );

        expect(result.data.linesRemoved).toBe(2);
        expect(result.data.countAdjustment).toBe(-1);
        expect(await readLines(filePath)).toEqual(['NEW', '']);
      });
    });
  });

  describe('rendering', () => {
    const sampleInput = {
      filePath: '/tmp/project/src/example.ts',
      range: { lineNumber: 5, leadingAnchor: 'line 5', count: 1 },
      replacement: 'REPLACED',
    };

    it('describes the edit for the approval prompt and the transcript', () => {
      expect(replaceInFile.formatArguments(sampleInput)).toMatchSnapshot();
      expect(
        replaceInFile.inputToString(sampleInput, channel)
      ).toMatchSnapshot();
    });

    it('formats a long replacement by showing only its tail', () => {
      const longReplacement = Array.from(
        { length: 8 },
        (_, i) => `line ${i + 1}`
      ).join('\n');

      expect(
        replaceInFile.formatArguments({
          ...sampleInput,
          replacement: longReplacement,
        })
      ).toMatchSnapshot();
    });

    it('reports the diff and the dropped seam lines together', async () => {
      const filePath = await prepareNamedFixture('render-seam.txt');

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: { lineNumber: 5, leadingAnchor: 'line 5', count: 1 },
            replacement: 'line 4\nNEW\nline 6',
          },
          channel,
          signal
        )
      );

      expect(
        replaceInFile.outputToString(result.data, channel, result.metadata)
      ).toMatchSnapshot();
    });

    it('reports a plain diff when no seam lines were dropped', async () => {
      const filePath = await prepareNamedFixture('render-plain.txt');

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: { lineNumber: 5, leadingAnchor: 'line 5', count: 1 },
            replacement: 'REPLACED',
          },
          channel,
          signal
        )
      );

      expect(
        replaceInFile.outputToString(result.data, channel, result.metadata)
      ).toMatchSnapshot();
    });
  });

  describe('reported diff', () => {
    /**
     * The report used to hand the renderer both complete files inside a
     * three-backtick block, and a Markdown file closes that block itself:
     * marked then fell back to plain text, so a one-line edit printed the whole
     * file instead of the hunk.
     */
    it('does not present unchanged lines for a small edit in a long file', async () => {
      const filePath = path.join(tmpDir, 'long-file.md');
      const body = Array.from({ length: 300 }, (_, i) => `prose ${i + 1}`);
      const original = `# Title\n\n\`\`\`ts\nconst a = 1;\n\`\`\`\n\n${body.join('\n')}\n`;
      await fs.writeFile(filePath, original, 'utf-8');

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            range: {
              lineNumber: 4,
              leadingAnchor: 'const a = 1;',
              trailingAnchor: '```',
              count: 2,
            },
            replacement: 'const a = 2;\n```',
          },
          channel,
          signal
        )
      );

      const report = replaceInFile.outputToString(
        result.data,
        channel,
        result.metadata
      );
      const rendered = parseMarkdown(report, 120);

      expect(rendered).toContain('const a = 2;');
      expect(rendered).not.toContain('prose');
      expect(rendered.split('\n').length).toBeLessThan(30);
      expect(rendered).toMatchSnapshot();
    });
  });
});
