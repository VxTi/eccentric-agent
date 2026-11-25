import { describe, expect, it } from 'vitest';
import { type Tokens, lexer } from 'marked';
import { formatDiffMd, splitDiffSides } from './diff-utils';

/** The payload of the single fenced block `formatDiffMd` is meant to emit. */
function diffBlock(previous: string, current: string): string {
  const tokens = lexer(formatDiffMd(previous, current));

  // Anything but one code token means the payload closed the fence itself and
  // marked went on to lex the rest of the file as ordinary text.
  expect(tokens.map(token => token.type)).toEqual(['code']);

  const [only] = tokens as Tokens.Code[];
  return only?.text ?? '';
}

describe('formatDiffMd', () => {
  it('gives back both sides exactly when they are split apart again', () => {
    const previous = 'line 1\nline 2\n';
    const current = 'line 1\nchanged\n';

    // The breaks that keep the marker alone on its line belong to the envelope:
    // handing them to the diff would add a blank row and shift every line number
    // printed beside it.
    const sides = splitDiffSides(diffBlock(previous, current));

    expect(sides?.[0]).toBe(previous);
    expect(sides?.[1]).toBe(current);
  });

  it('gives back both sides when neither ends in a line break', () => {
    const previous = 'line 1\nline 2';
    const current = 'line 1\nchanged';

    const sides = splitDiffSides(diffBlock(previous, current));

    expect(sides?.[0]).toBe(previous);
    expect(sides?.[1]).toBe(current);
  });

  it('keeps the payload inside one code block when a side is Markdown', () => {
    const previous = '# Title\n\n```ts\nconst a = 1;\n```\n\nprose\n';
    const current = previous.replace('const a = 1;', 'const a = 2;');

    // A fixed three-backtick fence is closed by the payload itself here, and
    // marked then lexes the remainder of the file as ordinary text: the sides
    // never reach the diff generator, so a one-line edit prints everything.
    expect(lexer(formatDiffMd(previous, current)).length).toBe(1);
    expect(splitDiffSides(diffBlock(previous, current))?.[1]).toBe(current);
  });

  it('grows the fence past the longest backtick run either side opens a line with', () => {
    expect(formatDiffMd('plain\n', 'plain\n').startsWith('```diff\n')).toBe(
      true
    );
    expect(formatDiffMd('```\n', 'x\n````\n').startsWith('`````diff\n')).toBe(
      true
    );
  });
});

describe('splitDiffSides', () => {
  it('returns null for text that is not a two-sided diff', () => {
    expect(splitDiffSides('no marker here')).toBeNull();
  });
});
