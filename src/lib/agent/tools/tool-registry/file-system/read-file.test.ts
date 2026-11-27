import { hasArrayLengthAtLeast } from '@vxti/typed';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { store } from '../../../../state';
import { setCwd } from '../../../../state/file-system';
import { NotifierChannel } from '../../../../events/notifier';
import { type ToolChannelParams } from '../../tool-definition';
import { readFile } from './read-file';
import { replaceInFile } from './replace-in-file';

const FIXTURE_LINES = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);

const channel = new NotifierChannel<ToolChannelParams>('test', () => {});
const signal = new AbortController().signal;

let tmpDir: string;
let filePath: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'read-file-test-'));
  filePath = path.join(tmpDir, 'fixture.txt');
  await fs.writeFile(filePath, `${FIXTURE_LINES.join('\n')}\n`, 'utf-8');
  store.dispatch(setCwd(tmpDir));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Parses `read_file` output (`<n>\t<line>` rows) back into 1-based pairs. */
function parseNumberedLines(content: string): Array<[number, string]> {
  return content.split('\n').map(row => {
    const match = row.match(/^ *(\d+)\t(.*)$/);
    if (!match) throw new Error(`Malformed row: ${row}`);
    return [Number(match[1]), match[2]] as [number, string];
  });
}

describe('read_file', () => {
  it('labels every line of a full read with its real 1-based position', async () => {
    const result = await readFile.handle({ filePath }, channel, signal);
    // A trailing newline splits into a phantom empty final row — pre-existing
    // behavior, consistent with replace_in_file's own splitting.
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed = parseNumberedLines(result.data.content);
    expect(parsed).toEqual([
      ...FIXTURE_LINES.map((line, i) => [i + 1, line] as [number, string]),
      [FIXTURE_LINES.length + 1, ''],
    ]);
  });

  it('labels a partial read (fromLineNumber + lineCount) with real line numbers', async () => {
    const result = await readFile.handle(
      { filePath, selection: { fromLineNumber: 4, lineCount: 3 } },
      channel,
      signal
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed = parseNumberedLines(result.data.content);
    expect(parsed).toEqual([
      [4, 'line 4'],
      [5, 'line 5'],
      [6, 'line 6'],
    ]);
  });

  it('labels a partial read (fromLineNumber only) with real line numbers', async () => {
    const result = await readFile.handle(
      { filePath, selection: { fromLineNumber: 8 } },
      channel,
      signal
    );

    expect(result.ok).toBe(true);
    const parsed = parseNumberedLines(result.data!.content);
    expect(parsed).toEqual([
      [8, 'line 8'],
      [9, 'line 9'],
      [10, 'line 10'],
      [11, ''],
    ]);
  });

  it('rejects selections beyond the file length', async () => {
    const result = await readFile.handle(
      { filePath, selection: { fromLineNumber: 9, lineCount: 5 } },
      channel,
      signal
    );

    expect(result.ok).toBe(false);
  });

  it('round-trips into replace_in_file without duplicating lines', async () => {
    // Reproduces the reported bug: a partial read whose labels disagree with
    // real line positions makes replace_in_file edit the line above the one
    // the model saw, leaving the original line duplicated below the edit.
    const readResult = await readFile.handle(
      { filePath, selection: { fromLineNumber: 4, lineCount: 3 } },
      channel,
      signal
    );
    if (!readResult.ok) throw new Error('read_file failed');

    const lineNrs = parseNumberedLines(readResult.data.content);
    expect.assert(hasArrayLengthAtLeast(lineNrs, 2));
    const [labeledLine, seenContent] = lineNrs[0];
    const [, nextContent] = lineNrs[1];
    expect(labeledLine).toBe(4);
    // The seen content alone may be ambiguous in the full file, so the edit
    // carries the following line the model also saw — a verbatim copy of the
    // partial read, exactly as the spec requires.
    const replaceResult = await replaceInFile.handle(
      {
        filePath,
        oldString: `${seenContent}\n${nextContent}`,
        newString: `REPLACED\n${nextContent}`,
      },
      channel,
      signal
    );
    expect(replaceResult.ok).toBe(true);
    if (!replaceResult.ok) return;
    // The exact match pins the edit to the seen content itself.
    expect(replaceResult.data.startLine).toBe(labeledLine);
    expect(replaceResult.data.matchKind).toBe('exact');

    const updated = await fs.readFile(filePath, 'utf-8');
    const updatedLines = updated.split('\n');

    expect(seenContent).toBe('line 4');
    expect(updatedLines).toEqual([
      'line 1',
      'line 2',
      'line 3',
      'REPLACED',
      'line 5',
      'line 6',
      'line 7',
      'line 8',
      'line 9',
      'line 10',
      '',
    ]);
    expect(updatedLines.filter(line => line === 'line 4')).toHaveLength(0);
    expect(updatedLines.filter(line => line === 'REPLACED')).toHaveLength(1);
  });
});
