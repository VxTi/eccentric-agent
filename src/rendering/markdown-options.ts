import chalk from 'chalk';
import { type TerminalRendererOptions } from 'marked-terminal';

export const basicHighlightFormatting = chalk.cyan.bold;

export const markdownFormattingOptions = {
  // Colors
  code: chalk.gray,
  blockquote: chalk.gray.italic,
  html: chalk.gray,
  heading: chalk.cyan.underline,
  firstHeading: chalk.cyan.bold,
  hr: chalk.reset,
  listitem: (item: string) => item.trim(),
  table: chalk.reset,
  paragraph: (p: string) => p.trim(),
  strong: chalk.bold,
  em: chalk.italic,
  codespan: basicHighlightFormatting,
  del: chalk.dim.gray.strikethrough,
  link: chalk.cyan,
  href: chalk.blue.underline,

  // Formats the bulletpoints and numbers for lists
  list: (list: string) => list.trim(),
  width: 80,
  reflowText: false,
  showSectionPrefix: false,

  // Whether or not to undo marked escaping
  // of enitities (" -> &quot; etc)
  unescape: true,
  emoji: true,
  // Options passed to cli-table3
  tableOptions: {},
  tab: 0,
} satisfies TerminalRendererOptions;
