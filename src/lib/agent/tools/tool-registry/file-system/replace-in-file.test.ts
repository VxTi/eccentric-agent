import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { store, setCwd } from '../../../../state';
import { NotifierChannel } from '../../../../events/notifier';
import type { ToolChannelParams } from '../../tool-definition';
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

/** Fresh fixture per test; a read is required first so the file cache is warm. */
async function prepareFixture(): Promise<string> {
  const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
  await fs.writeFile(filePath, `${FIXTURE_LINES.join('\n')}\n`, 'utf-8');

  const read = await readFile.handle({ filePath }, channel, signal);
  if (!read.ok) throw new Error('read_file failed');
  return filePath;
}

async function readLines(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  return content.split('\n');
}

describe('replace_in_file', () => {
  it('applies a plain replacement without repair', async () => {
    const filePath = await prepareFixture();

    const result = await replaceInFile.handle(
      {
        filePath,
        range: { lineNumber: 5, anchor: 'line 5', count: 1 },
        replacement: 'REPLACED',
      },
      channel,
      signal
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.duplicatesRemoved).toBe(0);

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
  });

  it('keeps the documented insert pattern (anchor re-included in replacement) untouched', async () => {
    const filePath = await prepareFixture();

    const result = await replaceInFile.handle(
      {
        filePath,
        range: { lineNumber: 5, anchor: 'line 5', count: 1 },
        replacement: 'line 5\nINSERTED',
      },
      channel,
      signal
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
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
    const result = await replaceInFile.handle(
      {
        filePath,
        range: { lineNumber: 5, anchor: 'line 5', count: 1 },
        replacement: 'line 4\nNEW',
      },
      channel,
      signal
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.duplicatesRemoved).toBe(1);

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

    const result = await replaceInFile.handle(
      {
        filePath,
        range: { lineNumber: 5, anchor: 'line 5', count: 2 },
        replacement: 'NEW A\nNEW B\nline 7',
      },
      channel,
      signal
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
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

    const result = await replaceInFile.handle(
      {
        filePath,
        range: { lineNumber: 5, anchor: 'line 5', count: 1 },
        replacement: 'line 3\nline 4\nNEW\nline 6',
      },
      channel,
      signal
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.duplicatesRemoved).toBe(3);
    const lines = await readLines(filePath);
    expect(lines.slice(2, 6)).toEqual(['line 3', 'line 4', 'NEW', 'line 6']);
  });

  it('skips the repair when every replacement line would be trimmed', async () => {
    const filePath = await prepareFixture();

    // A single line duplicating the neighbor is ambiguous: trimming it would
    // silently turn the edit into a deletion, so the input is kept verbatim.
    const result = await replaceInFile.handle(
      {
        filePath,
        range: { lineNumber: 5, anchor: 'line 5', count: 1 },
        replacement: 'line 4',
      },
      channel,
      signal
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.duplicatesRemoved).toBe(0);
    const lines = await readLines(filePath);
    expect(lines.slice(3, 6)).toEqual(['line 4', 'line 4', 'line 6']);
  });

  it('does not trim when the duplicate match would cross into the removed range', async () => {
    const filePath = await prepareFixture();

    // The anchor pattern with count > 1: replacement re-includes the removed
    // range itself, which is harmless and must not be trimmed from the seam
    // side (line 4 sits below the removed range [6, 7], not adjacent).
    const result = await replaceInFile.handle(
      {
        filePath,
        range: { lineNumber: 6, anchor: 'line 6', count: 2 },
        replacement: 'line 6\nline 7',
      },
      channel,
      signal
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.duplicatesRemoved).toBe(0);

    const lines = await readLines(filePath);
    expect(lines.slice(4, 8)).toEqual(['line 5', 'line 6', 'line 7', 'line 8']);
  });

  it('does not trim seams made only of punctuation or blank lines', async () => {
    const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
    await fs.writeFile(filePath, 'if (a) {\n  x();\n}\n', 'utf-8');

    // Wrapping `x()` in a new block legitimately ends with `}` before `}`.
    const result = await replaceInFile.handle(
      {
        filePath,
        range: { lineNumber: 2, anchor: '  x();', count: 1 },
        replacement: '  if (b) {\n    x();\n  }',
      },
      channel,
      signal
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.duplicatesRemoved).toBe(0);
  });

  describe('anchor resolution', () => {
    it('relocates to the anchor when earlier edits shifted line numbers', async () => {
      const filePath = await prepareFixture();

      const first = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 2, anchor: 'line 2', count: 1 },
          replacement: 'line 2\nA\nB',
        },
        channel,
        signal
      );
      expect(first.ok).toBe(true);

      // Second edit still uses line numbers from the original read.
      const second = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 7, anchor: 'line 7', count: 2 },
          replacement: 'SEVEN\nEIGHT',
        },
        channel,
        signal
      );

      expect(second.ok).toBe(true);
      if (!second.ok) return;
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

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 3, anchor: 'line 3', count: 1 },
          replacement: 'THREE',
        },
        channel,
        signal
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.startLine).toBe(4);
      expect((await readLines(filePath)).slice(0, 5)).toEqual([
        'external',
        'line 1',
        'line 2',
        'THREE',
        'line 4',
      ]);
    });

    it('rejects a repeated edit whose anchor no longer exists', async () => {
      const filePath = await prepareFixture();
      const input = {
        filePath,
        range: { lineNumber: 5, anchor: 'line 5', count: 1 },
        replacement: 'FIVE',
      };

      expect((await replaceInFile.handle(input, channel, signal)).ok).toBe(
        true
      );
      const before = await fs.readFile(filePath, 'utf-8');

      const retry = await replaceInFile.handle(input, channel, signal);

      expect(retry.ok).toBe(false);
      expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
    });

    it('falls back to whitespace-insensitive matching', async () => {
      const filePath = await prepareFixture();

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 4, anchor: '  line 6  ', count: 1 },
          replacement: 'SIX',
        },
        channel,
        signal
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.startLine).toBe(6);
    });

    it('picks the nearest of several matching lines', async () => {
      const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
      await fs.writeFile(filePath, 'x\na\nx\nb\nc\nd\nx\n', 'utf-8');

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 6, anchor: 'x', count: 1 },
          replacement: 'Y',
        },
        channel,
        signal
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.startLine).toBe(7);
    });

    it('rejects when two matches are equally near', async () => {
      const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
      await fs.writeFile(filePath, 'x\na\nx\n', 'utf-8');

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 2, anchor: 'x', count: 1 },
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
          range: { lineNumber: 1, anchor: 'line 9', count: 3 },
          replacement: 'Z',
        },
        channel,
        signal
      );

      expect(result.ok).toBe(false);
    });

    it('ignores a copied read_file line-number prefix in the anchor', async () => {
      const filePath = await prepareFixture();

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 5, anchor: ' 5\tline 5', count: 1 },
          replacement: 'FIVE',
        },
        channel,
        signal
      );

      expect(result.ok).toBe(true);
      expect((await readLines(filePath))[4]).toBe('FIVE');
    });

    it('anchors on the first line of a multi-line anchor', async () => {
      const filePath = await prepareFixture();

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 3, anchor: 'line 5\nline 6', count: 2 },
          replacement: 'FIVE\nSIX',
        },
        channel,
        signal
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.startLine).toBe(5);
    });

    it('matches a blank anchor against a whitespace-only hinted line', async () => {
      const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
      await fs.writeFile(filePath, 'a\n    \nb\n', 'utf-8');

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 2, anchor: '', count: 1 },
          replacement: 'X',
        },
        channel,
        signal
      );

      expect(result.ok).toBe(true);
      expect(await fs.readFile(filePath, 'utf-8')).toBe('a\nX\nb\n');
    });

    it('numbers lines like read_file in files with mixed line endings', async () => {
      const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
      await fs.writeFile(filePath, 'one\r\ntwo\nthree\nfour\r\n', 'utf-8');

      const read = await readFile.handle({ filePath }, channel, signal);
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(read.data.content).toContain('3\tthree');

      const result = await replaceInFile.handle(
        {
          filePath,
          range: { lineNumber: 3, anchor: 'three', count: 1 },
          replacement: 'THREE',
        },
        channel,
        signal
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.startLine).toBe(3);
      expect(await fs.readFile(filePath, 'utf-8')).toBe(
        'one\r\ntwo\r\nTHREE\r\nfour\r\n'
      );
    });
  });
});
