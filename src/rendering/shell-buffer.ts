import * as os from 'node:os';
import { stdout } from 'node:process';
import type { WriteStream } from 'node:tty';
import { formatMarkdown } from './formatting';
import { type UniqueArray } from '../common/types';

export interface Dimensions {
  width: number;
  height: number;
}

export interface InputFieldState {
  text: string;
  cursor: number;
  prefix?: string;
  pickerLines?: string[];
}

const ANSI_SCREEN_ENTER = '\x1b[?1049h\x1b[H\x1b[2J';
const ANSI_SCREEN_EXIT = '\x1b[?1049l';
const ANSI_CLEAR_HOME = '\x1b[H\x1b[2J';
const GRAY_BG = '\x1b[100m';

export class ShellBuffer {
  public dimensions: Dimensions;
  private fragments: BufferFragments[];
  private offset: number;
  private lines: BufferLine[];
  private inputField: InputFieldState | null;

  public readonly outputStream: WriteStream;

  constructor(outputStream: WriteStream = stdout) {
    this.outputStream = outputStream;
    this.fragments = [];
    this.lines = [];
    this.offset = 0;
    this.inputField = null;
    this.dimensions = {
      width: outputStream.columns ?? 80,
      height: outputStream.rows ?? 24,
    };

    this.outputStream.write(ANSI_SCREEN_ENTER);
    outputStream.on('resize', this.handleResize.bind(this));
  }

  /**
   * Push a raw (already styled) text blob. Convenience wrapper around
   * {@link push} for callers that already produced ANSI-styled strings.
   */
  public pushText(raw: string): void {
    if (!raw) return;
    this.push(textBlock({ content: raw }));
  }

  public append(...fragments: BufferFragments[]): void {
    this.push(...fragments);
  }

  public push(...fragments: BufferFragments[]): void {
    this.fragments.push(...fragments);
    this.computeBuffer();
    this.draw();
  }

  public setInputBox(state: InputFieldState | null): void {
    this.inputField = state;
    this.draw();
  }

  public get heightOffset(): number {
    return this.offset;
  }

  public setOffset(yAmount: number): void {
    this.offset = Math.max(0, yAmount);
    this.draw();
  }

  public clear(): void {
    this.fragments = [];
    this.lines = [];
    this.offset = 0;
    this.draw();
  }

  public dispose(): void {
    this.outputStream.write(ANSI_SCREEN_EXIT);
  }

  /**
   * Renders the buffer + input box to the output stream. Performs a full
   * screen redraw so callers can safely re-invoke after any state change.
   */
  public draw(): void {
    const { width, height } = this.dimensions;
    if (width <= 0 || height <= 0) return;

    const inputBlock = this.renderInputBlock();
    const historyHeight = Math.max(0, height - inputBlock.length);

    const totalLines = this.lines.length;
    const sliceStart = Math.max(0, totalLines - historyHeight - this.offset);
    const sliceEnd = Math.max(0, totalLines - this.offset);
    const visible = this.lines.slice(sliceStart, sliceEnd);

    let out = ANSI_CLEAR_HOME;

    // Pad the top so the input box sits at the bottom of the viewport.
    const padTop = Math.max(0, historyHeight - visible.length);
    if (padTop > 0) {
      out += '\n'.repeat(padTop);
    }

    if (visible.length > 0) {
      out += visible.map(l => l.computed).join(newlineChar());
      out += newlineChar();
    }

    if (inputBlock.length > 0) {
      out += inputBlock.join(newlineChar());
    }

    this.outputStream.write(out);

    if (this.inputField) {
      const cursorPos: Cursor = this.computeCursorPosition();
      this.outputStream.write(`\x1b[${cursorPos.row};${cursorPos.col}H`);
    }
  }

  private renderInputBlock(): string[] {
    if (!this.inputField) return [];

    const { width } = this.dimensions;
    const boxWidth = Math.max(8, Math.floor(width * 0.8));
    const leftPad = Math.max(0, Math.floor((width - boxWidth) / 2));
    const padding = ' '.repeat(leftPad);

    const prefix = this.inputField.prefix ?? '';
    const innerWidth = Math.max(1, boxWidth - 2);
    const rawText = (prefix + this.inputField.text)
      .padEnd(innerWidth)
      .slice(0, innerWidth);

    const emptyLine = `${padding + GRAY_BG + ' '.repeat(boxWidth) + RESET_ANSI}\n`;
    const inputLine = `${emptyLine}${padding}${GRAY_BG} ${rawText} ${RESET_ANSI}\n${emptyLine}`;

    const pickerLines = (this.inputField.pickerLines ?? []).map(line => {
      const visibleLen = stripAnsi(line).length;
      const padRight =
        boxWidth > visibleLen ? ' '.repeat(boxWidth - visibleLen) : '';
      return `${padding}${line}${padRight}`;
    });

    return [...pickerLines, inputLine];
  }

  private computeCursorPosition(): Cursor {
    const { width, height } = this.dimensions;
    const boxWidth = Math.max(8, Math.floor(width * 0.8));
    const leftPad = Math.max(0, Math.floor((width - boxWidth) / 2));

    const prefixLen = (this.inputField?.prefix ?? '').length;
    const cursor = this.inputField?.cursor ?? 0;

    // 1-indexed; +1 to skip the left gray-bg space margin
    const col = leftPad + 1 + 1 + prefixLen + cursor;
    const row = height - 2;
    return { row, col };
  }

  private handleResize(): void {
    this.dimensions = {
      width: this.outputStream.columns ?? 80,
      height: this.outputStream.rows ?? 24,
    };
    this.computeBuffer();
    this.draw();
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
  }

  private appendTextBlock(block: TextBlockFragment): void {
    const { width } = this.dimensions;
    const { content, align } = block;

    content
      .split('\n')
      .flatMap(line => {
        if (line.length <= width) return line;

        const chunks = line.match(new RegExp(`[\\s\\S]{1,${width}}`, 'g'));
        return chunks ?? line;
      })
      .forEach(line => {
        const alignedLine = this.alignText(line, align ?? DEFAULT_TEXT_ALIGN);
        this.lines.push({
          raw: line,
          computed: formatMarkdown(alignedLine),
        });
      });
  }

  private alignText(text: string, align: TextAlignment): string {
    const { width } = this.dimensions;
    if (align === 'left') return text;

    const visibleLen = stripAnsi(text).length;
    if (visibleLen >= width) return text;

    if (align === 'right') {
      return ' '.repeat(width - visibleLen) + text;
    }

    const sidePaddingCount = Math.floor((width - visibleLen) / 2);
    const sidePadding = ' '.repeat(sidePaddingCount);
    return `${sidePadding}${text}${sidePadding}`;
  }

  private appendTextFragment(fragment: TextFragment): void {
    const { color, background, styles, content } = fragment;

    const computedColor = TextColorAnsiMapping[color ?? DEFAULT_TEXT_COLOR];
    const computedBackground =
      BackgroundColorAnsiMapping[background ?? DEFAULT_BACKGROUND_COLOR];
    const computedStyle = (styles ?? [DEFAULT_TEXT_STYLE])
      .map(style => TextStyleAnsiMapping[style])
      .join('');

    const computedContent = `${computedColor}${computedBackground}${computedStyle}${content}${RESET_ANSI}`;

    const lastLine: BufferLine | undefined = this.lines.at(-1);

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
}

function newlineChar(): string {
  return os.platform() === 'win32' ? '\r\n' : '\n';
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

interface Cursor {
  row: number;
  col: number;
}

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

export type BackgroundColor =
  | 'none'
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

export const BackgroundColorAnsiMapping: Record<BackgroundColor, string> = {
  none: '',
  red: '\x1b[41m',
  green: '\x1b[42m',
  blue: '\x1b[44m',
  yellow: '\x1b[43m',
  cyan: '\x1b[46m',
  magenta: '\x1b[45m',
  white: '\x1b[47m',
  black: '\x1b[40m',
  gray: '\x1b[100m',
  ['bright-red']: '\x1b[101m',
  ['bright-green']: '\x1b[102m',
  ['bright-blue']: '\x1b[104m',
  ['bright-yellow']: '\x1b[103m',
  ['bright-cyan']: '\x1b[106m',
  ['bright-magenta']: '\x1b[105m',
  ['bright-white']: '\x1b[107m',
};

export type TextStyle = 'bold' | 'italic' | 'underline' | 'normal';

export const TextStyleAnsiMapping: Record<TextStyle, string> = {
  bold: '\x1b[1m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  normal: '\x1b[0m',
};

export const DEFAULT_TEXT_COLOR: TextColor = 'white';
export const DEFAULT_BACKGROUND_COLOR: BackgroundColor = 'none';
export const DEFAULT_TEXT_STYLE: TextStyle = 'normal';
export const DEFAULT_TEXT_ALIGN: TextAlignment = 'left';
export const RESET_ANSI = '\x1b[0m';

type TextAlignment = 'left' | 'center' | 'right';

export interface TextFragment {
  type: 'text';
  content: string;
  color?: TextColor;
  background?: BackgroundColor;
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
  computed: string;
  raw: string;
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
  styles?: [...UniqueArray<T>],
  background?: BackgroundColor
): TextFragment {
  return {
    type: 'text',
    content,
    color,
    background,
    styles,
  };
}
