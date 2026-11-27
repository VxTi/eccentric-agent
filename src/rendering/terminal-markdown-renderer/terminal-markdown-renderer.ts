'use strict';

import {
  isEmptyString,
  isNonEmptyArray,
  isNonEmptyString,
  isNotNil,
  toNonEmptyString,
} from '@vxti/typed';
import chalk, { type ChalkInstance } from 'chalk';
import Table from 'cli-table3';
import { type MarkedOptions, Renderer, type Tokens } from 'marked';
import { highlight as highlightCli } from 'cli-highlight';
import ansiEscapes from 'ansi-escapes';
import supportsHyperlinks from 'supports-hyperlinks';
import ansiRegex from 'ansi-regex';
import {
  generateSideBySideDiff,
  splitDiffSides,
  type DiffLine,
  type SideBySideDiff,
} from '../../lib/utils/diff-utils';
import { Position } from '../../lib/utils/string-utils';
import { githubDark } from './code-highlight-theme';
import type { TerminalMarked } from './types';
import type { ToolMessageData } from '../../lib/agent/tools/tool-payload';

const DEFAULT_INDENTATION = 2;
const DEFAULT_LANG = 'plaintext';
const DEFAULT_SHELL_WIDTH = 80;

const ANSI_REGEXP = ansiRegex();
const ESC = '\u001b';
const ANSI_RESET = `${ESC}[0m`;
// Captures SGR sequences so `split` retains them as alternate array entries.
const ANSI_FRAGMENT_RE = new RegExp(`(${ESC}\\[[0-9;]*m)`);

export const DIFF_LANG = 'diff';
export const DIFF_SEPARATOR = '---DIFF_SEPARATOR---';

/** Whole-side highlight results kept per `TerminalRenderer` instance. */
const MAX_HIGHLIGHT_CACHE_ENTRIES = 16;

const DIFF_LANG_PREFIX = `${DIFF_LANG}:`;

/**
 * The language a fenced block's *content* is written in.
 *
 * ` ```diff ` carries no information about the language being diffed, so it
 * resolves to plain text. ` ```diff:typescript ` states it explicitly, which is
 * the only way to highlight both columns as real code. Returns null when the
 * block is not a diff at all.
 */
function parseDiffLanguage(lang: string | undefined): string | null {
  if (lang === DIFF_LANG) return DEFAULT_LANG;
  if (isNonEmptyString(lang) && lang.startsWith(DIFF_LANG_PREFIX)) {
    return lang.slice(DIFF_LANG_PREFIX.length);
  }
  return null;
}

/**
 * The highlighted text for one line of a diff side, addressed by the 1-based
 * line number the diff algorithm recorded against it.
 */
function diffSideLine(side: string[], lineNumber: number | undefined): string {
  if (!isNotNil(lineNumber)) return '';
  return side[lineNumber - 1] ?? '';
}
/** Characters a two-sided row spends on everything that is not cell content. */
const DIFF_COLUMN_OVERHEAD = 5; // '<num> <cell> | <num> <cell>'
/** Characters a single-sided row spends on everything that is not cell content. */
const DIFF_SINGLE_COLUMN_OVERHEAD = 1; // '<num> <cell>'
const DIFF_MIN_COL_WIDTH = 10;

/** Width budget shared by every row of one rendered diff. */
interface DiffRowLayout {
  numberWidth: number;
  colWidth: number;
}

/** Everything a single-sided row draws: one cell taken from one side. */
interface SingleSidedRowParams {
  line: DiffLine;
  side: string[];
  lineNumber: number | undefined;
  at: Position;
}

/** The two halves one side-by-side row aligns. */
interface SideBySideRowParams {
  left: DiffLine;
  right: DiffLine;
  oldLines: string[];
  newLines: string[];
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

// HARD_RETURN holds a character sequence used to indicate text has a
// hard (no-reflowing) line break.  Previously \r and \r\n were turned
// into \n in marked's lexer- preprocessing step. So \r is safe to use
// to indicate a hard (non-reflowed) return.
const HARD_RETURN = '\r',
  HARD_RETURN_RE = new RegExp(HARD_RETURN),
  HARD_RETURN_GFM_RE = new RegExp(`${HARD_RETURN}|<br />`);

const defaultOptions: TerminalMarked.RendererOptions = {
  text: chalk.whiteBright,
  code: chalk.yellow,
  blockquote: chalk.gray.italic,
  html: chalk.gray,
  hr: chalk.reset,
  listitem: chalk.reset,
  table: chalk.reset,
  paragraph: chalk.reset,
  strong: chalk.bold,
  em: chalk.italic,
  codespan: chalk.yellow,
  del: chalk.dim.gray.strikethrough,
  link: chalk.blue,
  href: chalk.blue.underline,
  reflowText: false,
  indentation: 4,
};

export const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

interface RenderDiffProps {
  oldStr: string;
  newStr: string;
  lang?: string;
  availableWidth?: number;
  precomputedRows?: SideBySideDiff[];
}

export class TerminalRenderer extends Renderer {
  private readonly config: TerminalMarked.RendererOptions;
  private shellWidth: number;
  private diffData: ToolMessageData | undefined;
  /** Whole-side highlight results, reused across re-parses (terminal resizes,
   *  component remounts). Bounded: the newest entries matter most. */
  private readonly highlightCache = new Map<string, string[]>();

  public constructor(
    options: TerminalMarked.RendererOptions,
    markedOptions: MarkedOptions = {}
  ) {
    super(markedOptions);
    this.config = { ...defaultOptions, ...options };
    // `columns` is undefined whenever stdout is not a TTY. Without a fallback
    // the derived column width becomes NaN and every diff cell collapses to the
    // truncation mark.
    const { columns } = process.stdout;
    this.shellWidth =
      isNotNil(columns) && columns > 0 ? columns : DEFAULT_SHELL_WIDTH;
  }

  public textLength(input: string): number {
    return input.replace(ANSI_REGEXP, '').length;
  }

  /**
   * Attach pre-computed rendering data (diff rows) the message's tool built at
   * emit time. Re-set by every `parseMarkdown` call.
   */
  public setDiffData(data: ToolMessageData | undefined): void {
    this.diffData = data;
  }

  public override code({ text, lang }: Tokens.Code) {
    const contentLang = parseDiffLanguage(lang);
    let renderedContent: string;

    if (isNotNil(contentLang)) {
      // `splitDiffSides` strips the envelope breaks the diff format puts around
      // the marker; without them the new side gains a phantom leading row and
      // every line number printed beside it shifts by one.
      const sides = splitDiffSides(text);
      const payloadRows = isNotNil(sides)
        ? this.payloadRowsFor(sides)
        : undefined;

      renderedContent = isNotNil(sides)
        ? this.renderDiff({
            oldStr: sides[0],
            newStr: sides[1],
            lang: contentLang,
            availableWidth:
              this.width - (this.config.indentation ?? DEFAULT_INDENTATION),
            precomputedRows: payloadRows,
          })
        : this.highlightCode(text, contentLang);
    } else {
      renderedContent = this.highlightCode(text, lang ?? DEFAULT_LANG);
    }

    const finalContent = this.config.reflowText
      ? this.reflowText(renderedContent)
      : renderedContent;

    return this.makeSection(
      this.indent(this.config.indentation ?? DEFAULT_INDENTATION, finalContent),
      2
    );
  }

  public space(): string {
    return ' ';
  }

  public text(token: Tokens.Text | Tokens.Escape): string {
    const parsed =
      token.type === 'text' && isNonEmptyArray(token.tokens)
        ? this.parser.parseInline(token.tokens)
        : token.text;

    return this.config.text?.(parsed) ?? parsed;
  }

  public override listitem({
    loose,
    task,
    checked,
    tokens,
  }: Tokens.ListItem): string {
    let text: string = '';

    if (task) {
      const checkbox = this.checkbox({
        raw: '',
        type: 'checkbox',
        checked: checked ?? false,
      });
      if (loose) {
        if (tokens.length > 0 && tokens[0]?.type === 'paragraph') {
          tokens[0].text = `${checkbox} ${tokens[0].text}`;
          if (
            isNonEmptyArray(tokens[0].tokens) &&
            tokens[0].tokens[0].type === 'text'
          ) {
            tokens[0].tokens[0].text = `${checkbox} ${tokens[0].tokens[0].text}`;
          }
        } else {
          tokens.unshift({
            type: 'text',
            raw: `${checkbox} `,
            text: `${checkbox} `,
          });
        }
      } else {
        text += `${checkbox} `;
      }
    }

    text += this.parser.parse(tokens).trim();

    return this.config.listitem?.(text) ?? text;
  }

  public override list({ items }: Tokens.List): string {
    const transformed = items
      .map(item => this.listitem(item).trim())
      .join('\n');

    return this.makeSection(this.config.list?.(transformed) ?? transformed, 1);
  }

  public override blockquote({ tokens, text }: Tokens.Blockquote): string {
    const content = toNonEmptyString(this.parser.parse(tokens)) ?? text;
    const formatted = this.indent(
      this.config.indentation ?? DEFAULT_INDENTATION,
      content.trim()
    );
    return this.makeSection(this.config.blockquote?.(formatted) ?? formatted);
  }

  public override html({ text }: Tokens.HTML | Tokens.Tag): string {
    return this.config.html?.(text) ?? text;
  }

  /**
   * Renders `oldStr` -> `newStr` as two aligned columns, or as a single
   * full-width column when the change is one-sided (only additions or only
   * removals) — a permanently empty opposite column carries no information.
   *
   * `lang` is the language of the *content*, not of the diff itself; it is
   * what the columns are highlighted as.
   */
  public renderDiff({
    oldStr,
    newStr,
    lang = DEFAULT_LANG,
    availableWidth = this.width,
    precomputedRows,
  }: RenderDiffProps): string {
    const rows = precomputedRows ?? generateSideBySideDiff(oldStr, newStr);
    if (!isNonEmptyArray(rows)) return '';

    const hasRemoved = rows.some(([left, right]) =>
      Boolean(left.removed || right.removed)
    );
    const hasAdded = rows.some(([left, right]) =>
      Boolean(left.added || right.added)
    );
    const singleSided = hasRemoved !== hasAdded;

    const numberWidth = String(
      Math.max(oldStr.split('\n').length, newStr.split('\n').length)
    ).length;

    // Floor the cell width so a narrow terminal stays legible instead of
    // collapsing to nothing. The non-cell cost per row is numberWidth plus
    // the separators: two cells joined by ' | ', or one cell after '<num> '.
    const layout: DiffRowLayout = {
      numberWidth,
      colWidth: singleSided
        ? Math.max(
            DIFF_MIN_COL_WIDTH,
            availableWidth - numberWidth - DIFF_SINGLE_COLUMN_OVERHEAD
          )
        : Math.max(
            DIFF_MIN_COL_WIDTH,
            Math.floor(
              (availableWidth - 2 * numberWidth - DIFF_COLUMN_OVERHEAD) / 2
            )
          ),
    };

    // Highlight each side as a single block, then index it by line number.
    // Highlighting per line loses the state of any token that spans a line
    // break (block comment, template literal, multi-line literal), which is
    // most of what a diff of real code contains. Results are cached per side
    // string: re-parses (terminal resize, remount) re-layout but must not
    // re-highlight.
    const oldLines = this.highlightDiffSideCached(oldStr, lang);
    const newLines = this.highlightDiffSideCached(newStr, lang);

    const lines = rows.map(([left, right]) => {
      if (left.collapsed || right.collapsed) {
        return singleSided
          ? this.collapsedSingleSidedRow(layout)
          : this.collapsedRow(layout);
      }

      if (singleSided) {
        const line = hasAdded ? right : left;
        const at = hasAdded ? Position.START : Position.END;
        const side = hasAdded ? newLines : oldLines;
        const lineNumber = hasAdded
          ? line.lineNumberModified
          : line.lineNumberOriginal;
        return this.finishDiffRow(
          this.singleSidedDiffRow({ line, side, lineNumber, at }, layout)
        );
      }

      return this.finishDiffRow(
        this.sideBySideDiffRow({ left, right, oldLines, newLines }, layout)
      );
    });

    return lines.join('\n');
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
    const theme = this.config.codeHighlighting?.theme;
    const defaultStyle = theme?.default ?? githubDark.default ?? UNSTYLED;
    return openingOf(defaultStyle);
  }

  private collapsedRow(layout: DiffRowLayout): string {
    const blank = ' '.repeat(layout.numberWidth);
    const rule = chalk.dim(DIFF_ELLISION.repeat(layout.colWidth));
    return `${blank} ${rule} | ${blank} ${rule}`;
  }

  private collapsedSingleSidedRow(layout: DiffRowLayout): string {
    const blank = ' '.repeat(layout.numberWidth);
    return `${blank} ${chalk.dim(DIFF_ELLISION.repeat(layout.colWidth))}`;
  }

  private singleSidedDiffRow(
    { line, side, lineNumber, at }: SingleSidedRowParams,
    layout: DiffRowLayout
  ): string {
    return [
      this.diffNumber(lineNumber, layout.numberWidth),
      this.diffCell(diffSideLine(side, lineNumber), line, layout.colWidth, at),
    ].join(' ');
  }

  private sideBySideDiffRow(
    { left, right, oldLines, newLines }: SideBySideRowParams,
    layout: DiffRowLayout
  ): string {
    // Mirrors `collapsedRow`'s '<num> <cell> | <num> <cell>' layout: the
    // column separator sits between the two halves, not inside them.
    const oldHalf = [
      this.diffNumber(left.lineNumberOriginal, layout.numberWidth),
      this.diffCell(
        diffSideLine(oldLines, left.lineNumberOriginal),
        left,
        layout.colWidth,
        Position.END
      ),
    ].join(' ');
    const newHalf = [
      this.diffNumber(right.lineNumberModified, layout.numberWidth),
      this.diffCell(
        diffSideLine(newLines, right.lineNumberModified),
        right,
        layout.colWidth,
        Position.START
      ),
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
        ...this.config.codeHighlighting,
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

  /** The payload's rows when it was built from exactly `sides`' content. */
  private payloadRowsFor([previous, current]: [string, string]):
    | SideBySideDiff[]
    | undefined {
    const { diffData } = this;
    if (diffData?.kind !== 'diff') return undefined;
    if (diffData.previous !== previous || diffData.current !== current) {
      return undefined;
    }
    return diffData.rows;
  }

  /**
   * Truncates to `maxWidth` *display* characters while keeping the escape
   * sequences attached to the text they decorate. Unlike `ellipsize`, which
   * counts escape bytes as if they were visible.
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

  public override heading({ tokens, depth, text }: Tokens.Heading): string {
    const content = toNonEmptyString(this.parser.parseInline(tokens)) ?? text;
    const formatted = this.config.reflowText
      ? this.reflowText(content)
      : content;

    const headingIndex = Math.min(Math.max(depth - 1, 0), HEADINGS.length - 1);
    const formatter = this.config[HEADINGS[headingIndex] ?? 'h1'];
    return this.makeSection(formatter?.(formatted) ?? formatted, 2);
  }

  public override hr(): string {
    const dashes = '-'.repeat(this.width);

    return this.config.hr?.(dashes) ?? dashes;
  }

  public override checkbox({ checked }: Tokens.Checkbox): string {
    return `[${checked ? '✔' : ' '}] `;
  }

  public override paragraph({ tokens }: Tokens.Paragraph): string {
    const parsed = this.parser.parseInline(tokens);
    const formatted = this.config.paragraph?.(parsed) ?? parsed;
    const body = this.config.reflowText
      ? this.reflowText(formatted)
      : formatted;
    return `${body.trim()}\n`;
  }

  public override table({ header, rows }: Tokens.Table): string {
    // marked passes structured cell tokens, so build the cli-table3 rows
    // directly. Each body row must be an array of cell strings; pushing a plain
    // string (or an object) makes cli-table3 render a vertical table, which is
    // what produced the stray "text" first column and one cell per line.
    const table = new Table({
      head: header.map(cell => this.renderTableCell(cell)),
      ...(this.config.tableOptions ?? {}),
    });

    for (const row of rows) {
      table.push(row.map(cell => this.renderTableCell(cell)));
    }

    const content = table.toString();

    return this.makeSection(this.config.table?.(content) ?? content, 2);
  }

  private renderTableCell(cell: Tokens.TableCell): string {
    return this.parser.parseInline(cell.tokens).trim();
  }

  public override strong({ tokens, text }: Tokens.Strong): string {
    const parsed = toNonEmptyString(this.parser.parseInline(tokens)) ?? text;
    return this.config.strong?.(parsed) ?? parsed;
  }

  public override em({ tokens }: Tokens.Em): string {
    const parsed = this.parser.parseInline(tokens);
    const formatted = this.fixHardReturn(
      parsed,
      this.config.reflowText ?? false
    );
    return this.config.em?.(formatted) ?? formatted;
  }

  public override codespan({ text }: Tokens.Codespan): string {
    const formatted = this.fixHardReturn(text, this.config.reflowText ?? false);
    return this.config.codespan?.(formatted) ?? formatted;
  }

  public override br(): string {
    return this.config.reflowText ? HARD_RETURN : '\n';
  }

  public override del({ tokens }: Tokens.Del): string {
    const parsed = this.parser.parseInline(tokens);
    return this.config.del?.(parsed) ?? parsed;
  }

  public override link({ href, tokens }: Tokens.Link): string {
    const parsed = this.parser.parseInline(tokens);

    if (this.config.sanitizeUrls) {
      try {
        const decoded = decodeURIComponent(href)
          .replace(/[^\w:]/g, '')
          .toLowerCase();
        if (decoded.indexOf('javascript:') === 0) {
          return '';
        }
      } catch {
        return '';
      }
    }

    const hasText: boolean = isNonEmptyString(parsed) && parsed !== href;

    let out = '';

    if (supportsHyperlinks.stdout) {
      const link = this.config.href?.(parsed) ?? parsed;
      out = ansiEscapes.link(
        link,
        href
          // textLength breaks on '+' in URLs
          .replace(/\+/g, '%20')
      );
    } else {
      if (hasText) out += `${parsed} (`;
      out += this.config.href?.(href) ?? href;
      if (hasText) out += ')';
    }
    return this.config.link?.(out) ?? out;
  }

  public override image({ href, title, text }: Tokens.Image): string {
    return (
      this.config.image?.(title ?? '', href) ??
      `![${text}${isNonEmptyString(title) ? ` - ${title}` : ''}](${href})`
    );
  }

  /* ------------------------------------------------------------------ */

  private get width(): number {
    return this.shellWidth;
  }

  public setWidth(newWidth: number): void {
    this.shellWidth = newWidth;
  }

  private get isFormattingEnabled(): boolean {
    return chalk.level > 0;
  }

  private highlightCode(code: string, language: string): string {
    if (!this.isFormattingEnabled) return code;
    const reflowed: string = this.fixHardReturn(
      code,
      this.config.reflowText ?? false
    );
    try {
      return highlightCli(reflowed, {
        language,
        ...this.config.codeHighlighting,
      });
    } catch {
      return this.config.code?.(reflowed) ?? reflowed;
    }
  }

  private fixHardReturn(text: string, reflow: boolean): string {
    return reflow ? text.replace(HARD_RETURN, '\n') : text;
  }

  private indent(indent: number, text: string): string {
    if (isEmptyString(text)) return text;
    const pad = ' '.repeat(indent);
    return pad + text.split('\n').join(`\n${pad}`);
  }

  // Munge \n's and spaces in "text" so that the number of
  // characters between \n's is less than or equal to "width".
  private reflowText(text: string) {
    // Hard break was inserted by Renderer.prototype.br or is
    // <br /> when gfm is true
    const splitRe = this.options.gfm ? HARD_RETURN_GFM_RE : HARD_RETURN_RE;
    const sections: string[] = text.split(splitRe);
    const reflowed: string[] = [];

    sections.forEach(section => {
      // Split the section by escape codes so that we can
      // deal with them separately.
      const fragments = section.split(/(\u001b\[\d{1,3}(?:;\d{1,3})*m)/g);
      let column = 0;
      let currentLine = '';
      let lastWasEscapeChar = false;

      while (isNonEmptyArray(fragments)) {
        const fragment = fragments[0];

        if (fragment === '') {
          fragments.splice(0, 1);
          lastWasEscapeChar = false;
          continue;
        }

        // This is an escape code - leave it whole and
        // move to the next fragment.
        if (this.textLength(fragment) === 0) {
          currentLine += fragment;
          fragments.splice(0, 1);
          lastWasEscapeChar = true;
          continue;
        }

        fragment.split(/[ \t\n]+/).forEach(word => {
          const additionalSpaces = !lastWasEscapeChar && column != 0 ? 1 : 0;

          // If adding the new word overflows the required width
          if (column + word.length + additionalSpaces > this.width) {
            if (word.length <= this.width) {
              // If the new word is smaller than the required width
              // just add it at the beginning of a new line
              reflowed.push(currentLine);
              currentLine = word;
              column = word.length;
            } else {
              // If the new word is longer than the required width
              // split this word into smaller parts.
              const w = word.substring(
                0,
                this.width - column - additionalSpaces
              );
              if (additionalSpaces > 0) currentLine += ' ';
              currentLine += w;
              reflowed.push(currentLine);
              currentLine = '';
              column = 0;

              word = word.substring(w.length);
              while (isNonEmptyString(word)) {
                const w = word.substring(0, this.width);

                if (isEmptyString(w)) break;

                if (w.length < this.width) {
                  currentLine = w;
                  column = w.length;
                  break;
                } else {
                  reflowed.push(w);
                  word = word.substring(this.width);
                }
              }
            }
          } else {
            if (additionalSpaces > 0) {
              currentLine += ' ';
              column++;
            }

            currentLine += word;
            column += word.length;
          }

          lastWasEscapeChar = false;
        });

        fragments.splice(0, 1);
      }

      if (this.textLength(currentLine) > 0) reflowed.push(currentLine);
    });

    return reflowed.join('\n');
  }

  private makeSection(text: string, size: number = 2): string {
    const newlines = '\n'.repeat(size);
    return `${newlines}${text}${newlines}`;
  }

  private padRight(input: string, length: number): string {
    const currentLength = this.textLength(input);
    const padding = length - currentLength;
    return input + (padding > 0 ? ' '.repeat(padding) : '');
  }
}
