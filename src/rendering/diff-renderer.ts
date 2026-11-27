'use strict';

import { isNonEmptyArray, isNonEmptyString, isNotNil } from '@vxti/typed';
import chalk, { type ChalkInstance } from 'chalk';
import {
  type HighlightOptions,
  highlight as highlightCli,
} from 'cli-highlight';
import ansiRegex from 'ansi-regex';
import type { DiffLine } from '../lib/utils/diff-utils';
import { Position } from '../lib/utils/string-utils';
import type { DiffMessagePart } from '../lib/types/messages';
import { githubDark } from './terminal-markdown-renderer/code-highlight-theme';

const DEFAULT_LANG = 'plaintext';
const DEFAULT_SHELL_WIDTH = 80;
const DIFF_MIN_COL_WIDTH = 10;

const ANSI_REGEXP = ansiRegex();
const ESC = '\u001b';
const ANSI_RESET = `${ESC}[0m`;
// Captures SGR sequences so `split` retains them as alternate array entries.
const ANSI_FRAGMENT_RE = new RegExp(`(${ESC}\\[[0-9;]*m)`);

/** Whole-side highlight results kept per `DiffRenderer` instance. */
const MAX_HIGHLIGHT_CACHE_ENTRIES = 16;

/** Characters a two-sided row spends on everything that is not cell content. */
const DIFF_COLUMN_OVERHEAD = 5; // '<num> <cell> | <num> <cell>'

/** Width budget shared by every row of one rendered diff. */
interface DiffRowLayout {
  numberWidth: number;
  colWidth: number;
}

/** The two halves one side-by-side row aligns. */
interface SideBySideRowParams {
  left: DiffLine;
  right: DiffLine;
  oldText: string;
  newText: string;
}

const DIFF_REMOVED_MARKER = '- ';
const DIFF_ADDED_MARKER = '+ ';
const DIFF_NEUTRAL_MARKER = '  ';

const DIFF_TRUNCATION_MARK = '...';
const DIFF_ELLISION = '—';

/** One changed diff row's colour pair: its background and its plain text. */
interface DiffTint {
  background: ChalkInstance;
  text: ChalkInstance;
}

// Chalk downsamples colours to its current support level, so the styles must
// be built at render time, not once at module load.
const diffRemovedTint = (): DiffTint => ({
  background: chalk.bgRgb(55, 28, 33),
  text: chalk.rgb(248, 81, 73),
});

const diffAddedTint = (): DiffTint => ({
  background: chalk.bgRgb(24, 50, 37),
  text: chalk.rgb(63, 185, 80),
});

const DIFF_PROBE = '\u0001';

const UNSTYLED = (text: string): string => text;

/**
 * The escape sequence `style` opens with, extracted by probing it — it is not
 * a constant across chalk support levels. Empty when `style` is a no-op.
 */
function openingOf(style: (text: string) => string): string {
  const probe = style(DIFF_PROBE);
  const cut = probe.indexOf(DIFF_PROBE);
  return cut === -1 ? '' : probe.slice(0, cut);
}

interface DiffRendererOptions {
  codeHighlighting?: HighlightOptions;
}

/**
 * Lays out a {@link DiffMessagePart} as an ANSI side-by-side grid of two
 * aligned columns: removals on the left, additions on the right, one half
 * blank when a change touched only one side.
 *
 * `language` is the language of the *content*, not of the diff itself; it is
 * what the columns are highlighted as.
 */
export class DiffRenderer {
  private readonly codeHighlighting: HighlightOptions | undefined;
  private shellWidth: number;
  /** Whole-side highlight results, reused across re-parses (terminal resizes,
   *  component remounts). Bounded: the newest entries matter most. */
  private readonly highlightCache = new Map<string, string[]>();

  public constructor(options: DiffRendererOptions = {}, width?: number) {
    this.codeHighlighting = options.codeHighlighting;
    this.shellWidth = width ?? DEFAULT_SHELL_WIDTH;
  }

  public setWidth(newWidth: number): void {
    this.shellWidth = newWidth;
  }

  public renderDiff(part: DiffMessagePart): string {
    const { language = DEFAULT_LANG, lineCounts } = part;
    // Rows always come pre-computed from the emitting tool; an empty list
    // means no changes, so nothing is rendered.
    const rows = part.rows;
    if (!isNonEmptyArray(rows)) return '';

    const availableWidth = this.shellWidth;

    const numberWidth = String(
      Math.max(lineCounts.previous, lineCounts.current)
    ).length;

    // Floor the cell width so a narrow terminal stays legible instead of
    // collapsing to nothing. The non-cell cost per row is numberWidth plus
    // the separators: two cells joined by ' | '.
    const layout: DiffRowLayout = {
      numberWidth,
      colWidth: Math.max(
        DIFF_MIN_COL_WIDTH,
        Math.floor(
          (availableWidth - 2 * numberWidth - DIFF_COLUMN_OVERHEAD) / 2
        )
      ),
    };

    // Highlight each side as a single block of the visible rows joined, then
    // index it by row occurrence. Highlighting per line loses the state of any
    // token that spans a line break (block comment, template literal,
    // multi-line literal), which is most of what a diff of real code contains;
    // the visible rows are still one block, so tokens spanning consecutive
    // visible lines keep their state. Collapsed gaps carry no content, so
    // token state does not carry across a gap. Results are cached per side
    // string: re-parses (terminal resize, remount) re-layout but must not
    // re-highlight.
    const leftSource = rows
      .flatMap(([left]) =>
        isNotNil(left.lineNumberOriginal) ? [left.value] : []
      )
      .join('\n');
    const rightSource = rows
      .flatMap(([, right]) =>
        isNotNil(right.lineNumberModified) ? [right.value] : []
      )
      .join('\n');
    const oldLines = this.highlightDiffSideCached(leftSource, language);
    const newLines = this.highlightDiffSideCached(rightSource, language);

    let leftLine = 0;
    let rightLine = 0;
    const lines = rows.map(([left, right]) => {
      if (left.collapsed || right.collapsed) {
        return this.collapsedRow(layout);
      }

      const oldText = isNotNil(left.lineNumberOriginal)
        ? (oldLines[leftLine++] ?? '')
        : '';
      const newText = isNotNil(right.lineNumberModified)
        ? (newLines[rightLine++] ?? '')
        : '';

      return this.finishDiffRow(
        this.sideBySideDiffRow({ left, right, oldText, newText }, layout)
      );
    });

    return lines.join('\n');
  }

  private textLength(input: string): number {
    return input.replace(ANSI_REGEXP, '').length;
  }

  private get isFormattingEnabled(): boolean {
    return chalk.level > 0;
  }

  private diffNumber(lineNumber: number | undefined, width: number): string {
    if (!isNotNil(lineNumber)) return ' '.repeat(width);
    return chalk.dim(String(lineNumber).padStart(width, ' '));
  }

  private diffCell(
    source: string,
    line: DiffLine,
    width: number,
    at: Position
  ): string {
    const marker = line.removed
      ? DIFF_REMOVED_MARKER
      : line.added
        ? DIFF_ADDED_MARKER
        : DIFF_NEUTRAL_MARKER;
    const tint = line.removed
      ? diffRemovedTint()
      : line.added
        ? diffAddedTint()
        : undefined;

    // Clip after highlighting: the escape sequences are zero-width, so this is
    // the only order that both preserves colour and fills the column.
    const content = marker + this.clipAnsi(source, width - marker.length, at);
    const cell = this.padRight(
      tint ? this.tint(tint, content) : content,
      width
    );

    if (tint) return tint.background(cell);
    return cell;
  }

  /**
   * Recolours the parts of a changed row the code theme leaves plain, so the
   * row reads red/green while token colours (strings, keywords, …) survive.
   * Text the theme produced no escapes for at all takes the tint whole.
   */
  private tint(tint: DiffTint, text: string): string {
    if (!this.isFormattingEnabled) return text;
    const plainOpening = this.plainTextOpening();
    if (plainOpening !== '' && text.includes(plainOpening)) {
      return text.split(plainOpening).join(openingOf(tint.text));
    }
    if (!text.includes(ESC)) return tint.text(text);
    return text;
  }

  /** The style the configured code theme paints un-tokenized text with. */
  private plainTextOpening(): string {
    const defaultStyle =
      this.codeHighlighting?.theme?.default ?? githubDark.default ?? UNSTYLED;
    return openingOf(defaultStyle);
  }

  private collapsedRow(layout: DiffRowLayout): string {
    const blank = ' '.repeat(layout.numberWidth);
    const rule = chalk.dim(DIFF_ELLISION.repeat(layout.colWidth));
    return `${blank} ${rule} | ${blank} ${rule}`;
  }

  private sideBySideDiffRow(
    { left, right, oldText, newText }: SideBySideRowParams,
    layout: DiffRowLayout
  ): string {
    // Mirrors `collapsedRow`'s '<num> <cell> | <num> <cell>' layout: the
    // column separator sits between the two halves, not inside them.
    const oldHalf = [
      this.diffNumber(left.lineNumberOriginal, layout.numberWidth),
      this.diffCell(oldText, left, layout.colWidth, Position.END),
    ].join(' ');
    const newHalf = [
      this.diffNumber(right.lineNumberModified, layout.numberWidth),
      this.diffCell(newText, right, layout.colWidth, Position.START),
    ].join(' ');
    return `${oldHalf} | ${newHalf}`;
  }

  private finishDiffRow(row: string): string {
    // Clipping can cut a highlighted line inside an escape sequence, and the
    // background wrappers only close their own background. Terminate the row
    // so nothing bleeds into the next one or into the rest of the frame.
    return row.includes(ESC) ? `${row}${ANSI_RESET}` : row;
  }

  /**
   * Highlights `source` once and returns it split back into lines, each entry
   * corresponding to the same-indexed line of `source`. Falls back to the
   * plain lines whenever highlighting cannot be trusted to be line-aligned.
   */
  private highlightDiffSide(source: string, lang: string): string[] {
    const plain = source.split('\n');

    if (!this.isFormattingEnabled || !isNonEmptyString(lang)) return plain;
    if (lang === DEFAULT_LANG) return plain;

    let highlighted: string;
    try {
      highlighted = highlightCli(source, {
        language: lang,
        ...this.codeHighlighting,
      });
    } catch {
      // Highlighting is decorative; plain text is still a correct diff.
      return plain;
    }

    // cli-highlight terminates a multi-line block with a newline but not a
    // single-line one, so normalise before splitting.
    if (highlighted.endsWith('\n')) {
      highlighted = highlighted.slice(0, -1);
    }

    const lines = highlighted.split('\n');

    // A highlighter that rewraps or expands would shift every row against its
    // line number. Misaligned colour is worse than no colour.
    return lines.length === plain.length ? lines : plain;
  }

  /**
   * {@link highlightDiffSide} memoised on the side's exact content and
   * language. Sides re-arrive verbatim on every re-parse of the same message
   * (terminal resize, component remount), so the highlight — the most
   * expensive step of diff rendering — runs once per message side.
   */
  private highlightDiffSideCached(source: string, lang: string): string[] {
    const key = `${lang}\u0000${source}`;
    const cached = this.highlightCache.get(key);
    if (isNotNil(cached)) return cached;

    const lines = this.highlightDiffSide(source, lang);
    if (this.highlightCache.size >= MAX_HIGHLIGHT_CACHE_ENTRIES) {
      const oldest = this.highlightCache.keys().next().value;
      if (isNotNil(oldest)) this.highlightCache.delete(oldest);
    }
    this.highlightCache.set(key, lines);
    return lines;
  }

  /**
   * Truncates to `maxWidth` *display* characters while keeping the escape
   * sequences attached to the text they decorate.
   */
  private clipAnsi(text: string, maxWidth: number, at: Position): string {
    if (maxWidth <= 0) return '';
    if (this.textLength(text) <= maxWidth) return text;

    const budget = maxWidth - DIFF_TRUNCATION_MARK.length;
    const fragments = text.split(ANSI_FRAGMENT_RE);
    const kept: string[] = [];

    if (at === Position.START) {
      // Retain the tail, but carry the escapes that preceded it so the
      // surviving text keeps the colours it was rendered with.
      let skip = this.textLength(text) - budget;
      const pending: string[] = [];

      for (const fragment of fragments) {
        if (this.textLength(fragment) === 0) {
          if (skip > 0) pending.push(fragment);
          continue;
        }

        const characters = [...fragment];

        if (skip > 0) {
          if (characters.length <= skip) {
            skip -= characters.length;
            continue;
          }

          kept.push(...pending, ...characters.slice(skip));
          skip = 0;
          continue;
        }

        kept.push(...characters);
      }

      return `${DIFF_TRUNCATION_MARK}${kept.join('')}`;
    }

    let used = 0;

    for (const fragment of fragments) {
      if (used >= budget) break;

      if (this.textLength(fragment) === 0) {
        kept.push(fragment);
        continue;
      }

      const characters = [...fragment].slice(0, budget - used);
      kept.push(...characters);
      used += characters.length;
    }

    return `${kept.join('')}${DIFF_TRUNCATION_MARK}`;
  }

  private padRight(input: string, length: number): string {
    const currentLength = this.textLength(input);
    const padding = length - currentLength;
    return input + (padding > 0 ? ' '.repeat(padding) : '');
  }
}
