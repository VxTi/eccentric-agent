import { isNonEmptyArray, isNonEmptyString } from '@vxti/typed';
import chalk from 'chalk';
import { marked, type MarkedOptions } from 'marked';
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
  // The width is handed to the renderer through the parse options, so it scopes
  // to this parse alone: marked assigns the merged options of the current parse
  // to the renderer it invokes. Nothing is mutated on the shared renderer, and
  // a parse started later at another width cannot see this one's.
  const options: MarkedOptions & { width: number; async: false } = {
    gfm: true,
    renderer: terminalRenderer,
    async: false,
    width,
  };
  return marked.parse(input, options);
}

export interface LinesBlock {
  kind: 'lines';
  lines: string[];
}

export interface DiffBlock {
  kind: 'diff';
  part: DiffMessagePart;
}

export type MessageBlock = LinesBlock | DiffBlock;

/**
 * Splits a message into renderable blocks: parsed markdown (content and text
 * parts) as line blocks, diff parts kept whole so the UI can render them
 * interactively. Blocks are trimmed of blank edges and empty ones dropped;
 * callers are responsible for the spacing *between* blocks.
 */
export function renderMessageBlocks(
  content: string,
  parts: MessagePart[] | undefined,
  width: number
): MessageBlock[] {
  const blocks: MessageBlock[] = [
    { kind: 'lines', lines: markdownLines(content, width) },
    ...(parts ?? []).map(
      (part): MessageBlock =>
        part.type === MessagePartType.DIFF
          ? { kind: 'diff', part }
          : { kind: 'lines', lines: markdownLines(part.content, width) }
    ),
  ];
  return blocks.map(withoutBlankEdges).filter(isNonEmptyBlock);
}

function withoutBlankEdges(block: MessageBlock): MessageBlock {
  if (block.kind === 'diff') return block;

  const lines = trimBlankEdges(block.lines);
  return { kind: 'lines', lines };
}

function trimBlankEdges(lines: string[]): string[] {
  const first = lines.findIndex(line => line !== ' ');
  if (first === -1) return [];
  const last = lines.findLastIndex(line => line !== ' ');
  return lines.slice(first, last + 1);
}

function isNonEmptyBlock(block: MessageBlock): boolean {
  return block.kind === 'diff'
    ? isNonEmptyArray(block.part.rows)
    : block.lines.length > 0;
}

/**
 * Renders a message into display lines, its structured parts below the parsed
 * `content`. Parts are the sole carrier of rendering-only data — a diff part
 * holds the changed file's two sides, so the content never stores it a second
 * time.
 *
 * Markdown lines are trailing-trimmed (the renderer's leading indentation is
 * kept) and blank lines collapsed to a single space; diff
 * rows come through verbatim, since their column alignment is padding-based
 * and any trim would shear the grid's halves apart.
 */
export function renderMessageLines(
  content: string,
  parts: MessagePart[] | undefined,
  width: number
): string[] {
  return renderMessageBlocks(content, parts, width)
    .map(block =>
      block.kind === 'diff' ? diffLines(block.part, width) : block.lines
    )
    .flatMap((lines, index) => (index === 0 ? lines : [' ', ...lines]));
}

function markdownLines(markdown: string, width: number): string[] {
  return parseMarkdown(markdown, width)
    .split('\n')
    .map(line => {
      const trimmed = line.trimEnd();
      return trimmed.length === 0 ? ' ' : trimmed;
    });
}

export function diffLines(part: DiffMessagePart, width: number): string[] {
  const rendered = diffRenderer.renderDiff(part, width);
  return isNonEmptyString(rendered) ? rendered.split('\n') : [];
}
