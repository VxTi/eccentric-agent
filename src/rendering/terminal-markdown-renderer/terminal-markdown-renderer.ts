'use strict';

import chalk from 'chalk';
import Table from 'cli-table3';
import { type MarkedOptions, Renderer, type Tokens } from 'marked';
import { highlight as highlightCli } from 'cli-highlight';
import ansiEscapes from 'ansi-escapes';
import supportsHyperlinks from 'supports-hyperlinks';
import ansiRegex from 'ansi-regex';
import { generateSideBySideDiff } from '../../lib/utils/diff-utils';
import { type TerminalMarked } from './types';

const TABLE_CELL_SPLIT = '^*||*^';
const TABLE_ROW_WRAP = '*|*|*|*';
const TABLE_ROW_WRAP_REGEXP = new RegExp(escapeRegExp(TABLE_ROW_WRAP), 'g');

const DEFAULT_INDENTATION = 2;
const DEFAULT_LANG = 'plaintext';

const ANSI_REGEXP = ansiRegex();

export const DIFF_LANG = 'diff';
export const DIFF_SEPARATOR = '---DIFF_SEPARATOR---';

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
  maxWidth: 80,
  reflowText: false,
  indentation: 4,
};

export const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

export class TerminalRenderer extends Renderer {
  private readonly config: TerminalMarked.RendererOptions;
  private shellWidth: number;

  public constructor(
    options: TerminalMarked.RendererOptions,
    markedOptions: MarkedOptions = {}
  ) {
    super(markedOptions);
    this.config = { ...defaultOptions, ...options };
    this.shellWidth = options.maxWidth ?? process.stdout.columns;
  }

  public textLength(input: string): number {
    return input.replace(ANSI_REGEXP, '').length;
  }

  public override code({ text, lang }: Tokens.Code) {
    let renderedContent: string;

    if (lang === DIFF_LANG) {
      const parts = text.split(DIFF_SEPARATOR);
      if (parts.length === 2) {
        const oldStr = parts[0] ?? '';
        const newStr = parts[1] ?? '';
        renderedContent = this.renderDiff(oldStr, newStr, lang);
      } else {
        // Fallback for 'diff' language if separator is not found
        renderedContent = this.highlightCode(text, lang);
      }
    } else {
      // Original behavior for other languages
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
      token.type === 'text' && token.tokens?.length
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
            tokens[0].tokens &&
            tokens[0].tokens.length > 0 &&
            tokens[0].tokens[0]?.type === 'text'
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
    const content = this.parser.parse(tokens) || text;
    const formatted = this.indent(
      this.config.indentation ?? DEFAULT_INDENTATION,
      content.trim()
    );
    return this.makeSection(this.config.blockquote?.(formatted) ?? formatted);
  }

  public override html({ text }: Tokens.HTML | Tokens.Tag): string {
    return this.config.html?.(text) ?? text;
  }

  public renderDiff(
    oldStr: string,
    newStr: string,
    lang: string = DEFAULT_LANG
  ): string {
    const diff = generateSideBySideDiff(oldStr, newStr);
    const lineNumberWidth = String(
      Math.max(oldStr.split('\n').length, newStr.split('\n').length)
    ).length;

    // Layout per row:
    //   "<LN> <leftCol> | <LN> <rightCol>"
    //   = lineNumberWidth + 1 + colWidth + 1 + 1 + 1 + lineNumberWidth + 1 + colWidth
    //   = 2*lineNumberWidth + 2*colWidth + 5
    const fixedOverhead = 2 * lineNumberWidth + 5;
    const colWidth = Math.max(10, Math.floor((this.width - fixedOverhead) / 2));

    const result: string[] = [];

    diff.forEach(([left, right], i) => {
      if ((left.collapsed || right.collapsed) && i + 1 < diff.length) {
        const gap = chalk.dim('—'.repeat(colWidth));
        const blankLn = ' '.repeat(lineNumberWidth);
        result.push(`${blankLn} ${gap} | ${blankLn} ${gap}`);
        return;
      }

      const leftLineNumber = left.lineNumberOriginal
        ? String(left.lineNumberOriginal).padStart(lineNumberWidth, ' ')
        : ' '.repeat(lineNumberWidth);
      const rightLineNumber = right.lineNumberModified
        ? String(right.lineNumberModified).padStart(lineNumberWidth, ' ')
        : ' '.repeat(lineNumberWidth);

      const leftPrefix = left.removed ? '- ' : left.added ? '+ ' : '  ';
      const rightPrefix = right.added ? '+ ' : right.removed ? '- ' : '  ';

      // Reserve 2 chars for the prefix; truncate plain text BEFORE highlighting
      // so the ANSI escapes stay intact.
      const contentMax = colWidth - leftPrefix.length;
      let leftContent = this.truncatePlain(left.value, contentMax);
      let rightContent = this.truncatePlain(right.value, contentMax);

      if (lang && this.isFormattingEnabled) {
        try {
          if (leftContent) leftContent = this.highlightCode(leftContent, lang);
          if (rightContent)
            rightContent = this.highlightCode(rightContent, lang);
        } catch (error) {
          console.error(`Highlighting error for language ${lang}:`, error);
        }
      }

      if (left.removed) leftContent = chalk.bgRed(leftContent);
      if (right.added) rightContent = chalk.bgRgb(30, 150, 34)(rightContent);

      const paddedLeftContent = this.padRight(
        leftPrefix + leftContent,
        colWidth
      );
      const paddedRightContent = this.padRight(
        rightPrefix + rightContent,
        colWidth
      );

      result.push(
        `${chalk.dim(leftLineNumber)} ${paddedLeftContent} | ${chalk.dim(rightLineNumber)} ${paddedRightContent}`
      );
    });

    return result.join('\n');
  }

  private truncatePlain(input: string, maxLength: number): string {
    if (maxLength <= 0) return '';
    if (input.length <= maxLength) return input;
    if (maxLength === 1) return '…';
    return `${input.substring(0, maxLength - 2)}…`;
  }

  public override heading({ tokens, depth, text }: Tokens.Heading): string {
    const content = this.parser.parseInline(tokens) || text;
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
    return `${this.reflowText(this.config.paragraph?.(parsed) ?? parsed).trim()}\n`;
  }

  public override table({ header, rows }: Tokens.Table): string {
    let formattedHeader: string = header.reduce((text, cell) => {
      return text + this.tablecell(cell);
    }, '');
    formattedHeader += this.tablerow({ text: '' });

    const table = new Table({
      head: generateTableRow(formattedHeader),
      ...(this.config.tableOptions ?? {}),
    });

    const body = rows.reduce((text, tableCells) => {
      const cell = tableCells.reduce((text, tableCell) => {
        return text + this.tablecell(tableCell);
      }, '');

      return text + this.tablerow({ text: cell });
    }, '');

    generateTableRow(body).forEach(row => table.push({ text: row }));
    const content = table.toString();

    return this.makeSection(this.config.table?.(content) ?? content, 2);
  }

  public override tablerow({ text }: Tokens.TableRow): string {
    return `${TABLE_ROW_WRAP}${text}${TABLE_ROW_WRAP}\n`;
  }

  public override tablecell({ tokens }: Tokens.TableCell): string {
    return this.parser.parseInline(tokens) + TABLE_CELL_SPLIT;
  }

  public override strong({ tokens, text }: Tokens.Strong): string {
    const parsed = this.parser.parseInline(tokens) || text;
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

    const hasText: boolean = !!parsed && parsed !== href;

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
      `![${text}${title ? ` - ${title}` : ''}](${href})`
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
    if (!text) return text;
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

      while (fragments.length) {
        const fragment = fragments[0] ?? '';

        if (fragment === '') {
          fragments.splice(0, 1);
          lastWasEscapeChar = false;
          continue;
        }

        // This is an escape code - leave it whole and
        // move to the next fragment.
        if (!this.textLength(fragment)) {
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
              if (additionalSpaces) currentLine += ' ';
              currentLine += w;
              reflowed.push(currentLine);
              currentLine = '';
              column = 0;

              word = word.substring(w.length);
              while (word.length) {
                const w = word.substring(0, this.width);

                if (!w.length) break;

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
            if (additionalSpaces) {
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

      if (this.textLength(currentLine)) reflowed.push(currentLine);
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

function generateTableRow(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');

  const data: string[] = [];
  lines.forEach(line => {
    if (!line) return;
    const parsed: string[] = line
      .replace(TABLE_ROW_WRAP_REGEXP, '')
      .split(TABLE_CELL_SPLIT);

    data.push(...parsed.splice(0, parsed.length - 1));
  });
  return data;
}

function escapeRegExp(str: string): string {
  return str.replace(/[\-\[\]\/{}()*+?.\\^$|]/g, '\\$&');
}
