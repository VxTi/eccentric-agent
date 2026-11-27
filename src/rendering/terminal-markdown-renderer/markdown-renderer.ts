import { isNonEmptyString } from '@vxti/typed';
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
 * Renders a message's structured parts below its parsed `content`. Parts are
 * the sole carrier of rendering-only data — a diff part holds the changed
 * file's two sides, so the content never stores it a second time.
 */
export function renderMessageContent(
  content: string,
  parts: MessagePart[] | undefined,
  width: number
): string {
  const parsed = parseMarkdown(content, width);
  const renderedParts = renderParts(parts, width);
  return renderedParts.length === 0
    ? parsed
    : `${parsed.trimEnd()}\n\n${renderedParts}`;
}

function renderParts(parts: MessagePart[] | undefined, width: number): string {
  if (parts === undefined) return '';

  return parts
    .map(part => renderPart(part, width))
    .filter(rendered => isNonEmptyString(rendered))
    .join('\n\n');
}

function renderPart(part: MessagePart, width: number): string {
  return part.type === MessagePartType.DIFF
    ? renderDiffPart(part, width)
    : parseMarkdown(part.content, width);
}

function renderDiffPart(part: DiffMessagePart, width: number): string {
  diffRenderer.setWidth(width);
  return diffRenderer.renderDiff(part);
}
