import * as os from 'node:os';
import { stdout } from 'node:process';
import type { WriteStream } from 'node:tty';
import { formatMarkdown } from './formatting';
import {
  textBlock,
  type BufferFragments,
  type TextBlockFragment,
  type TextFragment,
} from './fragments';
import {
  BackgroundColorAnsiMapping,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_STYLE,
  RESET_ANSI,
  type TextAlignment,
  TextColorAnsiMapping,
  TextStyleAnsiMapping,
} from './styling';

const ANSI_SCREEN_ENTER = '\x1b[?1049h\x1b[H\x1b[2J';
const ANSI_SCREEN_EXIT = '\x1b[?1049l';
const ANSI_CLEAR_HOME = '\x1b[H\x1b[2J';
const GRAY_BG = '\x1b[100m';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

export class ShellBuffer {
  public dimensions: Dimensions;
  private fragments: BufferFragments[];
  private offset: number;
  private lines: BufferLine[];
  private inputField: InputFieldState | null;
  private status: string | null;
  private spinnerFrame: number;
  private spinnerTimer: NodeJS.Timeout | null;

  public readonly outputStream: WriteStream;

  constructor(outputStream: WriteStream = stdout) {
    this.outputStream = outputStream;
    this.fragments = [];
    this.lines = [];
    this.offset = 0;
    this.inputField = null;
    this.status = null;
    this.spinnerFrame = 0;
    this.spinnerTimer = null;
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

  /**
   * Sets an ephemeral status line (e.g. "thinking…") that renders just above
   * the input field. Pass `null` to clear. Drives an internal spinner so the
   * caller does not have to manage an external ora instance, which would
   * otherwise stomp on the input field's position.
   */
  public setStatus(text: string | null): void {
    this.status = text;
    if (text) {
      if (!this.spinnerTimer) {
        this.spinnerTimer = setInterval(() => {
          this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
          this.draw();
        }, SPINNER_INTERVAL_MS);
      }
    } else if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
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
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
    this.outputStream.write(ANSI_SCREEN_EXIT);
  }

  private contentBox(): { width: number; leftPad: number } {
    const { width } = this.dimensions;
    const boxWidth = Math.max(8, Math.floor(width * 0.8));
    const leftPad = Math.max(0, Math.floor((width - boxWidth) / 2));
    return { width: boxWidth, leftPad };
  }

  /**
   * Renders the buffer + status line + input box to the output stream.
   * Performs a full screen redraw so callers can safely re-invoke after any
   * state change.
   */
  public draw(): void {
    const { width, height } = this.dimensions;
    if (width <= 0 || height <= 0) return;

    const { leftPad } = this.contentBox();
    const padding = ' '.repeat(leftPad);

    const inputBlock = this.renderInputBlock();
    const statusBlock = this.renderStatusBlock();
    const reservedHeight = inputBlock.length + statusBlock.length;
    const historyHeight = Math.max(0, height - reservedHeight);

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
      out += visible.map(l => padding + l.computed).join(newlineChar());
      out += newlineChar();
    }

    if (statusBlock.length > 0) {
      out += statusBlock.join(newlineChar());
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

  private renderStatusBlock(): string[] {
    if (!this.status) return [];
    const { leftPad } = this.contentBox();
    const padding = ' '.repeat(leftPad);
    const frame = SPINNER_FRAMES[this.spinnerFrame];
    return [`${padding}\x1b[36m${frame}\x1b[0m ${this.status}`];
  }

  private renderInputBlock(): string[] {
    if (!this.inputField) return [];

    const { width: boxWidth, leftPad } = this.contentBox();
    const padding = ' '.repeat(leftPad);

    const prefix = this.inputField.prefix ?? '';
    const innerWidth = Math.max(1, boxWidth - 2);
    const rawText = (prefix + this.inputField.text)
      .padEnd(innerWidth)
      .slice(0, innerWidth);

    const emptyLine = `${padding + GRAY_BG + ' '.repeat(boxWidth) + RESET_ANSI}`;
    const inputLine = `${emptyLine}\n${padding}${GRAY_BG} ${rawText} ${RESET_ANSI}\n${emptyLine}`;

    const pickerLines = (this.inputField.pickerLines ?? []).map(line => {
      const visibleLen = stripAnsi(line).length;
      const padRight =
        boxWidth > visibleLen ? ' '.repeat(boxWidth - visibleLen) : '';
      return `${padding}${line}${padRight}`;
    });

    return [...pickerLines, inputLine];
  }

  private computeCursorPosition(): Cursor {
    const { height } = this.dimensions;
    const { leftPad } = this.contentBox();

    const prefixLen = (this.inputField?.prefix ?? '').length;
    const cursor = this.inputField?.cursor ?? 0;

    // 1-indexed; +1 to skip the left gray-bg space margin
    const col = leftPad + 1 + 1 + prefixLen + cursor;
    const row = height - 1;
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
    const { width: contentWidth } = this.contentBox();
    const { content, align } = block;

    content
      .split('\n')
      .flatMap(line => {
        if (line.length <= contentWidth) return line;

        const chunks = line.match(
          new RegExp(`[\\s\\S]{1,${contentWidth}}`, 'g')
        );
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
    const { width: contentWidth } = this.contentBox();
    if (align === 'left') return text;

    const visibleLen = stripAnsi(text).length;
    if (visibleLen >= contentWidth) return text;

    if (align === 'right') {
      return ' '.repeat(contentWidth - visibleLen) + text;
    }

    const sidePaddingCount = Math.floor((contentWidth - visibleLen) / 2);
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
    const { width: contentWidth } = this.contentBox();

    if (
      lastLine !== undefined &&
      lastLine.raw.length + content.length < contentWidth
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

interface BufferLine {
  computed: string;
  raw: string;
}

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
