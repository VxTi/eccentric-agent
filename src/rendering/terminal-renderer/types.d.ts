import { type ChalkInstance } from 'chalk';
import { type HighlightOptions } from 'cli-highlight';
import { type TableOptions } from 'cli-table3';

export declare namespace TerminalMarked {
  type StringTransformFn = (input: string) => string;

  export type Formatter = ChalkInstance | StringTransformFn | undefined;

  type HeadingOptions = {
    [K in 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6']?: Formatter;
  };

  interface RendererOptions extends Partial<HeadingOptions> {
    /**
     * Whether to use GitHub-flavored Markdown
     */
    gfm?: boolean;
    image?: (title: string, href: string) => string;
    code?: Formatter;
    blockquote?: Formatter;
    html?: Formatter;
    hr?: Formatter;
    listitem?: Formatter;
    list?: Formatter;
    table?: Formatter;
    paragraph?: Formatter;
    strong?: Formatter;
    em?: Formatter;
    codespan?: Formatter;
    del?: Formatter;
    link?: Formatter;
    href?: Formatter;
    text?: Formatter;
    unescape?: boolean;
    maxWidth?: number | undefined;
    indentation?: number | undefined;
    tableOptions?: TableOptions;
    reflowText?: boolean;

    sanitizeUrls?: boolean;

    codeHighlighting?: HighlightOptions;
  }
}
