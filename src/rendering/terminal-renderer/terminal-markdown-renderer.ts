'use strict';

import chalk from 'chalk';
import Table from 'cli-table3';
import { type MarkedOptions, Renderer, type Tokens } from 'marked';
import { highlight as highlightCli } from 'cli-highlight';
import ansiEscapes from 'ansi-escapes';
import supportsHyperlinks from 'supports-hyperlinks';
import ansiRegex from 'ansi-regex';
import { type TerminalMarked } from './types';

const TABLE_CELL_SPLIT = '^*||*^';
const TABLE_ROW_WRAP = '*|*|*|*';
const TABLE_ROW_WRAP_REGEXP = new RegExp(escapeRegExp(TABLE_ROW_WRAP), 'g');

const DEFAULT_INDENTATION = 2;
const DEFAULT_LANG = 'plaintext';

const ANSI_REGEXP = ansiRegex();

// HARD_RETURN holds a character sequence used to indicate text has a
// hard (no-reflowing) line break.  Previously \r and \r\n were turned
// into \n in marked's lexer- preprocessing step. So \r is safe to use
// to indicate a hard (non-reflowed) return.
const HARD_RETURN = '\r',
  HARD_RETURN_RE = new RegExp(HARD_RETURN),
  HARD_RETURN_GFM_RE = new RegExp(`${HARD_RETURN}|<br />`);

const defaultOptions: TerminalMarked.RendererOptions = {
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
  unescape: true,
  maxWidth: 80,
  reflowText: false,
  indentation: 4,
};

export const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

export class TerminalRenderer extends Renderer {
  private readonly config: TerminalMarked.RendererOptions;

  public constructor(
    options: TerminalMarked.RendererOptions,
    markedOptions: MarkedOptions = {}
  ) {
    super(markedOptions);
    this.config = { ...defaultOptions, ...options };
  }

  public textLength(input: string): number {
    return input.replace(ANSI_REGEXP, '').length;
  }

  public override code({ text, lang }: Tokens.Code) {
    return this.indent(
      this.config.indentation ?? DEFAULT_INDENTATION,
      this.highlightCode(text, lang ?? DEFAULT_LANG)
    );
  }

  public space(): string {
    return ' ';
  }

  public text(token: Tokens.Text | Tokens.Escape): string {
    const parsed =
      'tokens' in token && token.tokens && token.tokens.length > 0
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
        if (tokens.length > 0 && tokens[0].type === 'paragraph') {
          tokens[0].text = `${checkbox} ${tokens[0].text}`;
          if (
            tokens[0].tokens &&
            tokens[0].tokens.length > 0 &&
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

    return this.makeSection(this.config.list?.(transformed) ?? transformed);
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

  public override heading({ tokens, depth, text }: Tokens.Heading): string {
    const content = this.parser.parse(tokens) || text;
    const formatted = this.config.reflowText
      ? this.reflowText(content)
      : content;

    const headingIndex = Math.min(Math.max(depth - 1, 0), HEADINGS.length - 1);
    const formatter = this.config[HEADINGS[headingIndex]];
    return this.makeSection(formatter?.(formatted) ?? formatted);
  }

  public override hr(): string {
    const dashes = '-'.repeat(this.width);

    return this.config.hr?.(dashes) ?? dashes;
  }

  public override checkbox({ checked }: Tokens.Checkbox): string {
    return `[${checked ? '✔' : ' '}] `;
  }

  public override paragraph({ tokens }: Tokens.Paragraph): string {
    const parsed = this.parser.parse(tokens);
    return this.reflowText(this.config.paragraph?.(parsed) ?? parsed);
  }

  public override table({ header, rows }: Tokens.Table): string {
    let formattedHeader: string = header.reduce((text, cell) => {
      return text + this.tablecell(cell);
    }, '');
    formattedHeader += this.tablerow({ text: '' });

    const body = rows.reduce((text, tableCells) => {
      const cell = tableCells.reduce((text, tableCell) => {
        return text + this.tablecell(tableCell);
      }, '');

      return text + this.tablerow({ text: cell });
    }, '');

    const table = new Table({
      head: generateTableRow(formattedHeader),
      ...(this.config.tableOptions ?? {}),
    });

    generateTableRow(body).forEach(row => table.push({ text: row }));
    return this.config.table?.(table.toString()) ?? table.toString();
  }

  public override tablerow({ text }: Tokens.TableRow): string {
    return `${TABLE_ROW_WRAP}${text}${TABLE_ROW_WRAP}\n`;
  }

  public override tablecell({ tokens }: Tokens.TableCell): string {
    return this.parser.parse(tokens) + TABLE_CELL_SPLIT;
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
    return this.config.maxWidth ?? process.stdout.columns;
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
        const fragment = fragments[0];

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

        const words = fragment.split(/[ \t\n]+/);

        for (let i = 0; i < words.length; i++) {
          let word = words[i];
          let additionalSpaces = column != 0 ? 1 : 0;

          if (lastWasEscapeChar) additionalSpaces = 0;

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
        }

        fragments.splice(0, 1);
      }

      if (this.textLength(currentLine)) reflowed.push(currentLine);
    });

    return reflowed.join('\n');
  }

  private makeSection(text: string): string {
    return `\n\n${text}\n\n`;
  }
}

function generateTableRow(
  text: string,
  escape?: (input: string) => string
): string[] {
  if (!text) return [];
  escape = escape || ($ => $);
  const lines = escape(text).split('\n');

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
