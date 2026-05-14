import chalk from 'chalk';
import { stdout } from 'node:process';
import { type WriteStream } from 'node:tty';
import { type AgentContext } from '../common/AgentContext';

interface PickerState {
  triggerIndex: number;
  query: string;
  matches: string[];
  selected: number;
}

interface InternalRendererState {
  lastRenderedLines: number;
  buffer: string;
  cursor: number;
  picker: Readonly<PickerState> | null;
  maxSuggestions: number;
}

export type RendererState = Readonly<InternalRendererState>;

type PartialRendererState = Partial<Omit<RendererState, 'picker'>> & {
  picker?: Partial<PickerState> | null;
};

export class RendererInstance {
  public readonly outputStream: WriteStream;
  public readonly context: AgentContext;

  private readonly _state: InternalRendererState;

  constructor(context: AgentContext, outputStream: WriteStream = stdout) {
    this.context = context;
    this.outputStream = outputStream;
    this._state = {
      maxSuggestions: 8,
      lastRenderedLines: 0,
      buffer: '',
      cursor: 0,
      picker: null,
    };

    this.commitMessage(
      chalk.bold('eccentric-agent') +
        chalk.dim(' — type @ for files, Ctrl+C to exit\n')
    );
  }

  public setState(
    newState:
      | PartialRendererState
      | ((prevState: RendererState) => PartialRendererState)
  ): void {
    const newValue =
      typeof newState === 'function' ? newState(this.state) : newState;
    Object.assign(this.state, newValue);
  }

  public get state(): RendererState {
    return this._state;
  }

  public clearLines(n: number): void {
    for (let i = 0; i < n; i++) {
      this.commitMessage('\x1b[2K');
      if (i < n - 1) this.commitMessage('\x1b[1A');
    }
    this.commitMessage('\r');
  }

  public render(): void {
    const inputPrefix = chalk.cyan('> ');

    if (this._state.lastRenderedLines > 1) {
      this.commitMessage(`\x1b[${this._state.lastRenderedLines - 1}B`);
    }

    this.clearLines(this._state.lastRenderedLines);

    this.commitMessage(inputPrefix + this._state.buffer);
    let lines = 1;

    if (this._state.picker) {
      const { matches, selected } = this._state.picker;
      const visible = matches.slice(0, this._state.maxSuggestions);

      if (visible.length === 0) {
        this.commitMessage(`\n${chalk.dim('  (no matches)')}`);
        lines += 1;
      } else {
        for (let i = 0; i < visible.length; i++) {
          const marker = i === selected ? chalk.cyan('❯ ') : '  ';
          const line =
            i === selected ? chalk.cyan(visible[i]) : chalk.dim(visible[i]);
          this.commitMessage(`\n${marker}${line}`);
        }
        lines += visible.length;
        if (matches.length > visible.length) {
          this.commitMessage(
            `\n${chalk.dim(`  … ${matches.length - visible.length} more`)}`
          );
          lines += 1;
        }
      }
    }

    const cursorCol =
      inputPrefix.replace(/\x1b\[[0-9;]*m/g, '').length + this._state.cursor;
    if (lines > 1) {
      this.commitMessage(`\x1b[${lines - 1}A`);
    }
    this.commitMessage(`\r\x1b[${cursorCol}C`);

    this._state.lastRenderedLines = lines;
  }

  public commitMessage(text: string): void {
    this.outputStream.write(text);
  }
}
