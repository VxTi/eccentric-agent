import chalk from 'chalk';
import { marked } from 'marked';
import {
  HEADINGS,
  TerminalRenderer,
} from './terminal-renderer/terminal-markdown-renderer';
import { type TerminalMarked } from './terminal-renderer/types';

export const basicHighlightFormatting = chalk.cyan.bold;

export const markdownFormattingOptions = {
  // Colors
  code: chalk.gray,
  blockquote: chalk.gray.italic,
  html: chalk.gray,
  ...HEADINGS.map(h => ({ [h]: basicHighlightFormatting })),
  hr: chalk.reset,
  listitem: (item: string) => `${chalk.cyan('• ') + item}\n`,
  table: chalk.reset,
  paragraph: (p: string) => p.trim(),
  strong: chalk.bold,
  em: chalk.italic,
  codespan: basicHighlightFormatting,
  del: chalk.dim.gray.strikethrough,
  link: chalk.cyan,
  href: chalk.blue.underline,
  maxWidth: 80,
  reflowText: false,
  unescape: true,
  indentation: 2,
} satisfies TerminalMarked.RendererOptions;

export const terminalRenderer = new TerminalRenderer(markdownFormattingOptions);

export function parseMarkdown(input: string): string {
  return marked.parse(input, {
    gfm: true,
    renderer: terminalRenderer,
    async: false,
  });
}
