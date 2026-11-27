import chalk from 'chalk';
import { marked } from 'marked';
import { githubDark } from './code-highlight-theme';
import { HEADINGS, TerminalRenderer } from './terminal-markdown-renderer';
import type { TerminalMarked } from './types';
import type { ToolMessageData } from '../../lib/agent/tools/tool-payload';

export const basicHighlightFormatting = chalk.rgb(165, 214, 255);

export const markdownFormattingOptions = {
  // Colors
  code: chalk.gray,
  blockquote: chalk.gray.italic,
  html: chalk.gray,
  ...Object.fromEntries(HEADINGS.map(h => [h, basicHighlightFormatting])),
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
  maxWidth: 120,
  reflowText: false,
  unescape: true,
  indentation: 2,
  codeHighlighting: { theme: githubDark },
} satisfies TerminalMarked.RendererOptions;

export const terminalRenderer = new TerminalRenderer(markdownFormattingOptions);

/**
 * `width` is the column count the rendered blocks may occupy (diff grids are
 * laid out against it, paragraphs are wrapped by Ink at the real layout
 * width). Callers must pass the width their container actually gives them.
 *
 * `data` carries pre-computed rendering data (e.g. diff rows) the message's
 * tool attached at emit time, letting the renderer skip re-deriving it from
 * the parsed text.
 */
export function parseMarkdown(
  input: string,
  width: number,
  data?: ToolMessageData
): string {
  terminalRenderer.setWidth(width);
  terminalRenderer.setDiffData(data);
  return marked.parse(input, {
    gfm: true,
    renderer: terminalRenderer,
    async: false,
  });
}
