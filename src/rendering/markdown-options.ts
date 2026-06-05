import chalk from 'chalk';
import { type TerminalRendererOptions } from 'marked-terminal';

export const defaultOptions: TerminalRendererOptions = {
  // Colors
  code: chalk.gray,
  blockquote: chalk.gray.italic,
  html: chalk.gray,
  heading: chalk.blue.underline,
  firstHeading: chalk.blue.bold,
  hr: chalk.reset,
  listitem: chalk.reset,
  table: chalk.reset,
  paragraph: chalk.reset,
  strong: chalk.bold,
  em: chalk.italic,
  codespan: chalk.whiteBright.bgBlack,
  del: chalk.dim.gray.strikethrough,
  link: chalk.blue,
  href: chalk.blue.underline,

  // Formats the bulletpoints and numbers for lists
  list: (body, ordered) => {
    const partiallyFormatted = body
      .replace(/^\s*\*/, chalk.cyan(ordered ? `1.` : '•'))
      .trim();
    return partiallyFormatted; // marked.parse(partiallyFormatted, { async: false }).trim();
  },

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
};
