import { describe, expect, it } from 'vitest';
import { type Tokens, lexer } from 'marked';
import {
  formatDiffMd,
  generateSideBySideDiff,
  splitDiffSides,
} from './diff-utils';

/** The payload of the single fenced block `formatDiffMd` is meant to emit. */
function diffBlock(previous: string, current: string): string {
  const tokens = lexer(formatDiffMd(previous, current));
  expect(tokens.map(token => token.type)).toEqual(['code']);
  const [code] = tokens as Tokens.Code[];
  return code!.text;
}

function splitSides(text: string): [string, string] {
  const sides = splitDiffSides(text);
  expect(sides).not.toBeNull();
  return sides as [string, string];
}

function numberedFile(length: number): string {
  return `${Array.from({ length }, (_, i) => `line ${i + 1}`).join('\n')}\n`;
}

describe('formatDiffMd', () => {
  it('gives back both sides exactly when they are split apart again', () => {
    const previous = 'line 1\nline 2\n';
    const current = 'line 1\nchanged\n';

    // The breaks that keep the marker alone on its line belong to the envelope:
    // handing them to the diff would add a blank row and shift every line number
    // printed beside it.
    const [restoredPrevious, restoredCurrent] = splitSides(
      diffBlock(previous, current)
    );

    expect(restoredPrevious).toBe(previous);
    expect(restoredCurrent).toBe(current);
  });

  it('gives back both sides when neither ends in a line break', () => {
    const previous = 'line 1\nline 2';
    const current = 'line 1\nchanged';

    const [restoredPrevious, restoredCurrent] = splitSides(
      diffBlock(previous, current)
    );

    expect(restoredPrevious).toBe(previous);
    expect(restoredCurrent).toBe(current);
  });

  it('keeps the payload inside one code block when a side is Markdown', () => {
    const previous = '# Title\n\n```ts\nconst a = 1;\n```\n\nprose\n';
    const current = previous.replace('const a = 1;', 'const a = 2;');

    // A fixed three-backtick fence is closed by the payload itself here, and
    // marked then lexes the remainder of the file as ordinary text: the sides
    // never reach the diff generator, so a one-line edit prints everything.
    expect(lexer(formatDiffMd(previous, current)).length).toBe(1);
    const restoredCurrent = splitSides(diffBlock(previous, current))[1];
    expect(restoredCurrent).toBe(current);
  });

  it('grows the fence past the longest backtick run either side opens a line with', () => {
    expect(formatDiffMd('plain\n', 'plain\n').startsWith('```diff\n')).toBe(
      true
    );
    expect(formatDiffMd('```\n', 'x\n````\n').startsWith('`````diff\n')).toBe(
      true
    );
  });

  it('matches its documented envelope shape', () => {
    expect(
      formatDiffMd('line 1\nline 2\n', 'line 1\nchanged\n')
    ).toMatchSnapshot();
  });
});

describe('splitDiffSides', () => {
  it('returns null for text that is not a two-sided diff', () => {
    expect(splitDiffSides('no marker here')).toBeNull();
  });

  it('strips exactly the envelope breaks and nothing else', () => {
    expect(splitSides(diffBlock('a\nb\n', 'a\nc\n'))).toMatchSnapshot();
  });
});

describe('generateSideBySideDiff', () => {
  it('produces no rows for identical input', () => {
    expect(generateSideBySideDiff('a\nb\n', 'a\nb\n')).toEqual([]);
    expect(generateSideBySideDiff('a\nb\n', 'a\nb\n', 5)).toEqual([]);
  });

  it('pairs a replacement onto shared rows', () => {
    expect(generateSideBySideDiff('a\nb\nc\n', 'a\nB\nc\n')).toMatchSnapshot();
  });

  it('pairs a pure insertion with a blank left side', () => {
    expect(generateSideBySideDiff('a\nc\n', 'a\nb\nc\n')).toMatchSnapshot();
  });

  it('pairs a pure deletion with a blank right side', () => {
    expect(generateSideBySideDiff('a\nb\nc\n', 'a\nc\n')).toMatchSnapshot();
  });

  it('pads the shorter side of a resized block', () => {
    expect(
      generateSideBySideDiff('a\nb\nc\n', 'a\nx\ny\nz\nc\n')
    ).toMatchSnapshot();
  });

  it('collapses unchanged regions around a change', () => {
    const file = numberedFile(20);
    expect(
      generateSideBySideDiff(file, file.replace('line 10', 'line TEN'))
    ).toMatchSnapshot();
  });

  it('honours an explicit context size of zero', () => {
    const file = numberedFile(20);
    expect(
      generateSideBySideDiff(file, file.replace('line 10', 'line TEN'), 0)
    ).toMatchSnapshot();
  });

  it('marks each unchanged stretch between two changes once', () => {
    const file = numberedFile(30);
    expect(
      generateSideBySideDiff(
        file,
        file.replace('line 5', 'FIVE').replace('line 25', 'TWENTY-FIVE'),
        1
      )
    ).toMatchSnapshot();
  });

  it('collapses an unchanged head even when the change starts the file', () => {
    const file = numberedFile(20);
    expect(
      generateSideBySideDiff(file, file.replace('line 1', 'line ONE'))
    ).toMatchSnapshot();
  });
});
