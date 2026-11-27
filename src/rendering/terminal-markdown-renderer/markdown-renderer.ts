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
 * `data` carries the diff a tool pre-computed at emit time, rendered as a grid
 * below the parsed content. The diff travels only as data: the message content
 * never embeds the changed file, so it is not stored twice.
 */
export function parseMarkdown(
  input: string,
  width: number,
  data?: ToolMessageData
): string {
  terminalRenderer.setWidth(width);
  const parsed = marked.parse(input, {
    gfm: true,
    renderer: terminalRenderer,
    async: false,
  });

  const diff = renderMessageDiff(data, width);
  return diff === undefined ? parsed : `${parsed.trimEnd()}\n\n${diff}`;
}

function renderMessageDiff(
  data: ToolMessageData | undefined,
  width: number
): string | undefined {
  if (data?.kind !== 'diff') return undefined;

  const rendered = terminalRenderer.renderDiff({
    oldStr: data.previous,
    newStr: data.current,
    lang: data.language,
    availableWidth: width,
    precomputedRows: data.rows,
  });

  return rendered.length > 0 ? rendered : undefined;
}
