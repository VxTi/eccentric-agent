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

/**
 * Fixture with an explicit line list, so a test can repeat line content.
 * Written exactly as joined: a trailing `''` element produces the file's
 * trailing newline, so tests control that state explicitly.
 */
async function prepareLines(...lines: string[]): Promise<string> {
  const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
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
  it('applies an exact single-occurrence replacement', async () => {
    const filePath = await prepareNamedFixture('exact-replacement.txt');

    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          oldString: 'line 4\nline 5',
          newString: 'FOUR',
        },
        channel,
        signal
      )
    );

    expect(result.data.startLine).toBe(4);
    expect(result.data.matchKind).toBe('exact');
    expect(snapshotable(result.data)).toMatchSnapshot();

    expect(await fs.readFile(filePath, 'utf-8')).toBe(
      'line 1\nline 2\nline 3\nFOUR\nline 6\nline 7\nline 8\nline 9\nline 10\n'
    );
  });

  it('grows the file when the replacement spans more lines than the match', async () => {
    const filePath = await prepareFixture();

    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          oldString: 'line 5',
          newString: 'FIVE A\nFIVE B\nFIVE C',
        },
        channel,
        signal
      )
    );

    expect(result.data.startLine).toBe(5);
    expect(await readLines(filePath)).toEqual([
      'line 1',
      'line 2',
      'line 3',
      'line 4',
      'FIVE A',
      'FIVE B',
      'FIVE C',
      'line 6',
      'line 7',
      'line 8',
      'line 9',
      'line 10',
      '',
    ]);
  });

  it('deletes the match when `newString` is empty', async () => {
    const filePath = await prepareFixture();

    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          oldString: 'line 5\nline 6\n',
          newString: '',
        },
        channel,
        signal
      )
    );

    expect(result.data.matchKind).toBe('exact');
    expect(await fs.readFile(filePath, 'utf-8')).toBe(
      'line 1\nline 2\nline 3\nline 4\nline 7\nline 8\nline 9\nline 10\n'
    );
  });

  it('replaces within a single line (inline edit)', async () => {
    const filePath = await prepareFixture();

    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          oldString: 'line 5',
          newString: 'line 5 (edited)',
        },
        channel,
        signal
      )
    );

    expect(result.data.matchKind).toBe('exact');
    const lines = await readLines(filePath);
    expect(lines[4]).toBe('line 5 (edited)');
    expect(lines.filter(line => line === 'line 5')).toHaveLength(0);
  });

  it('rejects an ambiguous oldString and leaves the file unchanged', async () => {
    const filePath = await prepareLines('x', 'a', 'x', 'b', '');
    const before = await fs.readFile(filePath, 'utf-8');

    const error = expectError(
      await replaceInFile.handle(
        { filePath, oldString: 'x', newString: 'Y' },
        channel,
        signal
      )
    );

    expect(error).toContain('`oldString` matches 2 times');
    expect(error).toContain('lines 1, 3');
    expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
  });

  it('lists at most five matching line numbers', async () => {
    const filePath = await prepareLines('x', 'x', 'x', 'x', 'x', 'x', 'x');

    const error = expectError(
      await replaceInFile.handle(
        { filePath, oldString: 'x', newString: 'Y' },
        channel,
        signal
      )
    );

    expect(error).toContain('matches 7 times');
    expect(error).toContain('(lines 1, 2, 3, 4, 5)');
  });

  it('matches whole lines ignoring indentation and replaces them verbatim', async () => {
    // Tab-indented on disk so that no indentation variant of `oldString` can
    // match exactly as a substring; only the whole-line fallback can apply.
    const filePath = await prepareLines(
      'function f() {',
      '\treturn 1;',
      '}',
      ''
    );

    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          oldString: '  return 1;',
          newString: '  return 2;',
        },
        channel,
        signal
      )
    );

    expect(result.data.matchKind).toBe('whitespace');
    expect(result.data.startLine).toBe(2);
    expect(await fs.readFile(filePath, 'utf-8')).toBe(
      'function f() {\n  return 2;\n}\n'
    );
  });

  it('rejects an ambiguous whitespace-lenient match and leaves the file unchanged', async () => {
    const filePath = await prepareLines('a', 'b', 'a', 'b');
    const before = await fs.readFile(filePath, 'utf-8');

    const error = expectError(
      await replaceInFile.handle(
        { filePath, oldString: '  a\n  b', newString: 'X' },
        channel,
        signal
      )
    );

    expect(error).toContain('(ignoring indentation) matches 2 times');
    expect(error).toContain('lines 1, 3');
    expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
  });

  it('rejects an oldString that is not found at all and leaves the file unchanged', async () => {
    const filePath = await prepareFixture();
    const before = await fs.readFile(filePath, 'utf-8');

    const error = expectError(
      await replaceInFile.handle(
        { filePath, oldString: 'no such line', newString: 'Y' },
        channel,
        signal
      )
    );

    expect(error).toContain('was not found');
    expect(error).toContain('re-read it and retry');
    expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
  });

  it('matches a multi-line oldString sent with \\n into a CRLF file and keeps CRLF endings', async () => {
    const filePath = path.join(tmpDir, `fixture-${++counter}.txt`);
    await fs.writeFile(filePath, 'a\r\nb\r\nc\r\n', 'utf-8');

    const result = expectOk(
      await replaceInFile.handle(
        {
          filePath,
          oldString: 'b\nc',
          newString: 'X\nY',
        },
        channel,
        signal
      )
    );

    expect(result.data.matchKind).toBe('exact');
    expect(result.data.startLine).toBe(2);
    expect(await fs.readFile(filePath, 'utf-8')).toBe('a\r\nX\r\nY\r\n');
  });

  it('preserves content outside the match and the trailing-newline state', async () => {
    const withTrailing = await prepareLines('alpha', 'beta', 'gamma', '');
    const withoutTrailing = await prepareLines('alpha', 'beta', 'gamma');

    const kept = expectOk(
      await replaceInFile.handle(
        {
          filePath: withTrailing,
          oldString: 'beta',
          newString: 'BETA',
        },
        channel,
        signal
      )
    );
    expect(kept.data.matchKind).toBe('exact');
    expect(await fs.readFile(withTrailing, 'utf-8')).toBe(
      'alpha\nBETA\ngamma\n'
    );

    await replaceInFile.handle(
      {
        filePath: withoutTrailing,
        oldString: 'beta',
        newString: 'BETA',
      },
      channel,
      signal
    );
    expect(await fs.readFile(withoutTrailing, 'utf-8')).toBe(
      'alpha\nBETA\ngamma'
    );
  });

  it('rejects an empty oldString', async () => {
    const filePath = await prepareFixture();

    const error = expectError(
      await replaceInFile.handle(
        { filePath, oldString: '', newString: 'Y' },
        channel,
        signal
      )
    );

    expect(error).toBe('`oldString` is empty.');
  });

  it('rejects identical oldString and newString', async () => {
    const filePath = await prepareFixture();
    const before = await fs.readFile(filePath, 'utf-8');

    const error = expectError(
      await replaceInFile.handle(
        { filePath, oldString: 'line 5', newString: 'line 5' },
        channel,
        signal
      )
    );

    expect(error).toBe(
      '`oldString` and `newString` are identical; nothing to replace.'
    );
    expect(await fs.readFile(filePath, 'utf-8')).toBe(before);
  });

  it('reports a missing file with a friendly, path-bearing error', async () => {
    const filePath = path.join(tmpDir, 'does-not-exist.txt');

    const result = await replaceInFile.handle(
      { filePath, oldString: 'anything', newString: 'NEW' },
      channel,
      signal
    );

    const error = expectError(result);
    expect(error).toContain(filePath);
    expect(error).not.toContain('ENOENT');
  });

  describe('rendering', () => {
    const sampleInput = {
      filePath: '/tmp/project/src/example.ts',
      oldString: 'line 5',
      newString: 'REPLACED',
    };

    it('shows the old text, an ellipsis, and the new text', () => {
      expect(replaceInFile.formatArguments(sampleInput)).toMatchSnapshot();
      expect(
        replaceInFile.inputToString(sampleInput, channel)
      ).toMatchSnapshot();
    });

    it('formats long arguments by showing only their tail', () => {
      const longText = Array.from(
        { length: 8 },
        (_, i) => `line ${i + 1}`
      ).join('\n');

      expect(
        replaceInFile.formatArguments({
          ...sampleInput,
          oldString: longText,
          newString: longText,
        })
      ).toMatchSnapshot();
    });

    it('renders the diff through the markdown renderer', async () => {
      const filePath = await prepareNamedFixture('render-diff.txt');

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            oldString: 'line 5',
            newString: 'REPLACED',
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
      expect(report).toContain('Edited `render-diff.txt`');
      expect(parseMarkdown(report, 120)).toMatchSnapshot();
    });

    it('notes when the whitespace-lenient fallback was used', async () => {
      // Tab-indented on disk so only the whole-line fallback can apply; the
      // stable file name keeps the output snapshot from churning.
      const filePath = path.join(tmpDir, 'render-whitespace.txt');
      await fs.writeFile(filePath, 'function f() {\n\treturn 1;\n}\n', 'utf-8');

      const result = expectOk(
        await replaceInFile.handle(
          {
            filePath,
            oldString: '  return 1;',
            newString: '  return 2;',
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
      expect(report).toContain(
        'Matched ignoring per-line indentation; whole lines were replaced.'
      );
      expect(parseMarkdown(report, 120)).toMatchSnapshot();
    });
  });
});
