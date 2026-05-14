import * as os from 'node:os';
import { stdin, stdout } from 'node:process';
import type { ReadStream, WriteStream } from 'node:tty';
import { formatMarkdown } from '../common/formatting';
import { type UniqueArray } from '../common/types';

export class ShellBuffer {
  private dimensions: Dimensions;
  private fragments: BufferFragments[];
  private offset: number; // By how much the buffer is translated.
  private lines: BufferLine[];

  private inputStream: ReadStream;
  private outputStream: WriteStream;

  constructor(
    inputStream: ReadStream = stdin,
    outputStream: WriteStream = stdout
  ) {
    this.inputStream = inputStream;
    this.outputStream = outputStream;
    this.fragments = [];
    this.lines = [];
    this.offset = 0;
    this.dimensions = {
      width: outputStream.columns,
      height: outputStream.rows,
    };

    // \x1b[?1000h : Enable mouse click/scroll tracking
    // \x1b[?1006h : Enable SGR protocol (better for modern terminals)
    // \x1b[3J     : Clears terminal + history
    // \x1b[H      : Puts cursor at position 0
    this.outputStream.write('\x1b[?1000h\x1b[?1006h\x1b[3J\x1b[H');
    this.inputStream.on('resize', this.handleResize.bind(this));
    this.inputStream.on('data', this.handleKeyInput.bind(this));
  }

  public append(...fragments: BufferFragments[]) {
    this.push(...fragments);
  }

  public push(...fragments: BufferFragments[]): void {
    this.fragments.push(...fragments);
    this.computeBuffer();
  }

  public get content(): string {
    const visibleLines = this.lines.slice(
      this.offset,
      this.offset + this.dimensions.height
    );

    // TODO: compute raw content into at most `dimensions.width` (chars wide) and `dimensions.height` (lines)
    return visibleLines.map(line => line.computed).join(this.newlineChar);
  }

  public get heightOffset(): number {
    return this.offset;
  }

  public setOffset(yAmount: number): void {
    this.offset = yAmount;
    this.computeBuffer();
  }

  public clear(): void {
    this.fragments = [];
    this.offset = 0;
    this.computeBuffer();
  }

  private handleResize(): void {
    this.dimensions = {
      width: this.outputStream.columns,
      height: this.outputStream.rows,
    };
    this.computeBuffer();
  }

  private handleKeyInput(data: Buffer): void {
    const str = data.toString();

    // Handle Ctrl+C to exit and cleanup
    if (str === '\u0003') {
      // Disable mouse tracking before exiting!
      this.outputStream.write('\x1b[?1000l\x1b[?1006l');
      process.exit();
    }

    // SGR Mouse Format: \x1b[<BUTTON;X;Y[M|m]
    if (str.startsWith('\x1b[<')) {
      const match = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
      if (match) {
        const [_, button] = match;

        if (button === MOUSE_EVENT_KEY_SCROLL_UP) {
          this.setOffset(this.offset + 1);
        } else if (button === MOUSE_EVENT_KEY_SCROLL_DOWN) {
          this.setOffset(this.offset - 1);
        }
      }
    }
  }

  private computeBuffer(): void {
    this.lines = [];
    this.fragments.forEach(fragment => {
      switch (fragment.type) {
        case 'line':
          fragment.textFragments.forEach(this.appendTextFragment.bind(this));
          break;
        case 'text-block':
          this.appendTextBlock(fragment);
          break;
      }
    });

    this.outputStream.write(this.content);
  }

  private appendTextBlock(block: TextBlockFragment): void {
    // Text blocks will always occupy their own lines, so we don't have to append
    // these fragments to previous lines, unlike `TextFragment`s
    const { width } = this.dimensions;
    const { content, align } = block;

    content
      // Map to actual newline chars
      .split('\n')
      // split lines into even more lines if they exceed shell dimensions
      .map(line => [
        ...(line.match(new RegExp(`[\s\S]{1,${width}`, 'g')) ?? []),
      ])
      .flat()
      .map(line => {
        const alignedLine = this.alignText(line, align ?? DEFAULT_TEXT_ALIGN);

        this.lines.push({
          raw: line,
          computed: formatMarkdown(alignedLine),
        });
      });
  }

  /**
   * Aligns the given text either left or right, conforming to the maximum
   * buffer size (see {@link this.dimensions.width})
   * @private
   */
  private alignText(text: string, align: TextAlignment): string {
    const { width } = this.dimensions;

    // No transformations needed
    if (align === 'left') return text;

    if (align === 'right') {
      return ' '.repeat(width - text.length) + text;
    }

    const sidePaddingCount = (width - text.length) / 2;
    const sidePadding = ' '.repeat(sidePaddingCount);

    return `${sidePadding}${text}${sidePadding}`;
  }

  /**
   * Appends the provided text fragment into the line buffer
   * Computes overflow; if the content overflows the previous text
   * fragment, it will create a new one.
   * @private
   */
  private appendTextFragment(fragment: TextFragment): void {
    const { color, styles, content } = fragment;

    const computedColor = TextColorAnsiMapping[color ?? DEFAULT_TEXT_COLOR];
    const computedStyle = (styles ?? [DEFAULT_TEXT_STYLE])
      .map(style => TextStyleAnsiMapping[style])
      .join('');

    const computedContent = `${computedColor}${computedStyle}${content}${RESET_ANSI}`;

    const lastLine: BufferLine | undefined = this.lines.at(-1);

    // We can try to append it to the last fragment, if it doesn't exceed
    // boundaries
    if (
      lastLine !== undefined &&
      lastLine.raw.length + content.length < this.dimensions.width
    ) {
      lastLine.raw += content;
      lastLine.computed += computedContent;
      return;
    }

    this.lines.push({
      raw: content,
      computed: computedContent,
    });
  }

  /**
   * Platform specific newline character.
   * Used for final raw buffer computation.
   * @private
   */
  private get newlineChar(): string {
    return os.platform() === 'win32' ? '\r\n' : '\n';
  }
}

const MOUSE_EVENT_KEY_SCROLL_UP = '65';
const MOUSE_EVENT_KEY_SCROLL_DOWN = '64';

export type TextColor =
  | 'red'
  | 'green'
  | 'blue'
  | 'yellow'
  | 'cyan'
  | 'magenta'
  | 'white'
  | 'black'
  | 'gray'
  | 'bright-red'
  | 'bright-green'
  | 'bright-blue'
  | 'bright-yellow'
  | 'bright-cyan'
  | 'bright-magenta'
  | 'bright-white';

export const TextColorAnsiMapping: Record<TextColor, string> = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  black: '\x1b[30m',
  gray: '\x1b[90m',
  ['bright-red']: '\x1b[91m',
  ['bright-green']: '\x1b[92m',
  ['bright-blue']: '\x1b[94m',
  ['bright-yellow']: '\x1b[93m',
  ['bright-cyan']: '\x1b[96m',
  ['bright-magenta']: '\x1b[95m',
  ['bright-white']: '\x1b[97m',
};

export type TextStyle = 'bold' | 'italic' | 'underline' | 'normal';

export const TextStyleAnsiMapping: Record<TextStyle, string> = {
  bold: '\x1b[1m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  normal: '\x1b[0m',
};

export const DEFAULT_TEXT_COLOR: TextColor = 'white';
export const DEFAULT_TEXT_STYLE: TextStyle = 'normal';
export const DEFAULT_TEXT_ALIGN: TextAlignment = 'left';
export const RESET_ANSI = '\x1b[0m';

type TextAlignment = 'left' | 'center' | 'right';

export interface TextFragment {
  type: 'text';
  content: string;
  color?: TextColor;
  styles?: TextStyle[];
}

export interface TextBlockFragment {
  type: 'text-block';
  align?: TextAlignment;
  content: string;
}

export interface LineFragment {
  type: 'line';
  textFragments: TextFragment[];
}

interface BufferLine {
  // styled text
  computed: string;
  // Raw non-computed (unstyled) text
  raw: string;
}

interface Dimensions {
  width: number;
  height: number;
}

type BufferFragments = LineFragment | TextBlockFragment;

export function textBlock(
  props: Omit<TextBlockFragment, 'type'>
): TextBlockFragment {
  return { ...props, type: 'text-block' };
}

export function lineFragment(...textFragments: TextFragment[]): LineFragment {
  return {
    type: 'line',
    textFragments,
  };
}

export function textFragment<T extends TextStyle[]>(
  content: string,
  color?: TextColor,
  styles?: [...UniqueArray<T>]
): TextFragment {
  return {
    type: 'text',
    content,
    color,
    styles,
  };
}

async function test() {
  const buf = new ShellBuffer();

  await new Promise(res => {
    buf.append(
      lineFragment(
        textFragment('Hello world!', 'blue'),
        textFragment('in a different!', 'red'),
        textFragment('Color', 'green', ['underline', 'bold'])
      )
    );

    setTimeout(() => {
      res(void 0);
    }, 10000);
  });
}

test()
  .then(() => {
    console.log('Exiting.');
    stdout.write('\x1b[?1000l\x1b[?1006l');
    process.exit(0);
  })
  .catch(e => {
    console.error('Something went wrong', e);
    process.exit(1);
  });
