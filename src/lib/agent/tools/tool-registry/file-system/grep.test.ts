import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import '../../../../state';
import { NotifierChannel } from '../../../../events/notifier';
import { type ToolChannelParams } from '../../tool-definition';
import { grep } from './grep';

const channel = new NotifierChannel<ToolChannelParams>('test', () => {});
const signal = new AbortController().signal;

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-test-'));
  await fs.mkdir(path.join(tmpDir, 'src/nested'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'node_modules/dep'), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, 'src/nested/a.ts'),
    'export function alpha() {}\nconst beta = alpha(1);\n'
  );
  await fs.writeFile(path.join(tmpDir, 'src/b.md'), 'alpha in docs\n');
  await fs.writeFile(path.join(tmpDir, 'src/dup.txt'), 'alpha alpha alpha\n');
  await fs.writeFile(
    path.join(tmpDir, 'src/many.txt'),
    `${Array.from({ length: 25 }, (_, i) => `alpha ${i}`).join('\n')}\n`
  );
  await fs.writeFile(
    path.join(tmpDir, 'node_modules/dep/index.ts'),
    'export function alpha() {}\n'
  );
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function matchLocations(
  input: Omit<Parameters<typeof grep.handle>[0], 'directoryPath'>
) {
  const result = await grep.handle(
    { directoryPath: tmpDir, ...input },
    channel,
    signal
  );
  if (!result.ok) throw new Error(result.error);
  return result.data.matches
    .map(m => `${path.relative(tmpDir, m.filePath)}:${m.line}`)
    .sort();
}

describe('grep', () => {
  it('treats the pattern as a regular expression by default', async () => {
    expect(await matchLocations({ pattern: 'function alpha|beta =' })).toEqual([
      'src/nested/a.ts:1',
      'src/nested/a.ts:2',
    ]);
  });

  it('matches regex metacharacters literally when isRegex is false', async () => {
    expect(
      await matchLocations({ pattern: 'alpha(1)', isRegex: false })
    ).toEqual(['src/nested/a.ts:2']);
  });

  it('returns an actionable error for an invalid regex', async () => {
    const result = await grep.handle(
      { directoryPath: tmpDir, pattern: 'alpha(' },
      channel,
      signal
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('isRegex: false');
  });

  it('matches a slash-free filePattern at any depth', async () => {
    expect(
      await matchLocations({ pattern: 'alpha', filePattern: '*.ts' })
    ).toEqual(['src/nested/a.ts:1', 'src/nested/a.ts:2']);
  });

  it('keeps path-anchored filePatterns relative to the search root', async () => {
    expect(
      await matchLocations({ pattern: 'alpha', filePattern: 'src/*.md' })
    ).toEqual(['src/b.md:1']);
  });

  it('returns at most one match per line', async () => {
    expect(
      await matchLocations({ pattern: 'alpha', filePattern: 'dup.txt' })
    ).toEqual(['src/dup.txt:1']);
  });

  it('caps matches per file and reports truncation', async () => {
    const result = await grep.handle(
      { directoryPath: tmpDir, pattern: 'alpha', filePattern: 'many.txt' },
      channel,
      signal
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.data.matches).toHaveLength(20);
    expect(result.metadata.truncated).toBe(true);
  });

  it('flags truncation when maxResults is hit', async () => {
    const result = await grep.handle(
      { directoryPath: tmpDir, pattern: 'alpha', maxResults: 2 },
      channel,
      signal
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.data.matches).toHaveLength(2);
    expect(result.metadata.truncated).toBe(true);
  });

  it('lists matching files with outputMode files_with_matches', async () => {
    const result = await grep.handle(
      {
        directoryPath: tmpDir,
        pattern: 'alpha',
        outputMode: 'files_with_matches',
      },
      channel,
      signal
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.data.matches).toEqual([]);
    expect(result.data.files.map(f => path.relative(tmpDir, f))).toEqual([
      'src/b.md',
      'src/dup.txt',
      'src/many.txt',
      'src/nested/a.ts',
    ]);
    expect(result.metadata.truncated).toBe(false);
  });
});
