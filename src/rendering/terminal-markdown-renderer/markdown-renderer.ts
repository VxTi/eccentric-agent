import { isNonEmptyArray, isNonEmptyString } from '@vxti/typed';
import chalk from 'chalk';
import { marked } from 'marked';
import { githubDark } from './code-highlight-theme';
import { HEADINGS, TerminalRenderer } from './terminal-markdown-renderer';
import { DiffRenderer } from '../diff-renderer';
import {
  MessagePartType,
  type DiffMessagePart,
  type MessagePart,
} from '../../lib/types/messages';
import type { TerminalMarked } from './types';

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

const diffRenderer = new DiffRenderer({
  codeHighlighting: { theme: githubDark },
});

/**
 * `width` is the column count the rendered blocks may occupy (diff grids are
 * laid out against it, paragraphs are wrapped by Ink at the real layout
 * width). Callers must pass the width their container actually gives them.
 */
export function parseMarkdown(input: string, width: number): string {
  terminalRenderer.setWidth(width);
  return marked.parse(input, {
    gfm: true,
    renderer: terminalRenderer,
    async: false,
  });
}

/**
 * Renders a message into display lines, its structured parts below the parsed
 * `content`. Parts are the sole carrier of rendering-only data — a diff part
 * holds the changed file's two sides, so the content never stores it a second
 * time.
 *
 * Markdown lines are trimmed and blank lines collapsed to a single space; diff
 * rows come through verbatim, since their column alignment is padding-based
 * and any trim would shear the grid's halves apart.
 */
export function renderMessageLines(
  content: string,
  parts: MessagePart[] | undefined,
  width: number
): string[] {
  const blocks = [
    markdownLines(content, width),
    ...(parts ?? []).map(part =>
      part.type === MessagePartType.DIFF
        ? diffLines(part, width)
        : markdownLines(part.content, width)
    ),
  ]
    .map(withoutBlankEdges)
    .filter(isNonEmptyArray);

  return blocks.flatMap((block, index) =>
    index === 0 ? block : [' ', ...block]
  );
}

function withoutBlankEdges(lines: string[]): string[] {
  const first = lines.findIndex(line => line !== ' ');
  if (first === -1) return [];
  const last = lines.findLastIndex(line => line !== ' ');
  return lines.slice(first, last + 1);
}

function markdownLines(markdown: string, width: number): string[] {
  return parseMarkdown(markdown, width)
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      return trimmed.length === 0 ? ' ' : trimmed;
    });
}

function diffLines(part: DiffMessagePart, width: number): string[] {
  diffRenderer.setWidth(width);
  const rendered = diffRenderer.renderDiff(part);
  return isNonEmptyString(rendered) ? rendered.split('\n') : [];
}
