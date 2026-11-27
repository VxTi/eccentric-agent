import { describe, expect, it } from 'vitest';
import { diffLanguageForFile, generateSideBySideDiff } from './diff-utils';

function numberedFile(length: number): string {
  return `${Array.from({ length }, (_, i) => `line ${i + 1}`).join('\n')}\n`;
}

describe('diffLanguageForFile', () => {
  it('resolves a supported file extension to its language', () => {
    expect(diffLanguageForFile('src/app.ts')).toBe('ts');
    expect(diffLanguageForFile('README.md')).toBe('md');
    expect(diffLanguageForFile('config.yml')).toBe('yml');
  });

  it('returns undefined for dotfiles, extension-less paths and unknown extensions', () => {
    expect(diffLanguageForFile('.gitignore')).toBeUndefined();
    expect(diffLanguageForFile('Makefile')).toBeUndefined();
    expect(diffLanguageForFile('notes.weirdext')).toBeUndefined();
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
