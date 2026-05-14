import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { stdin, stdout } from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { type ReadStream } from 'node:tty';
import {
  type AgentContext,
  type DequeuedRequest,
  type ManagedUserInputQueue,
} from '../common/agent-context';
import { type LocalFile } from '../file-selector';
import { type KeyEvent, KeyType } from './key-event';

export interface InputState {
  paused: boolean;
}

interface PickerState {
  triggerIndex: number;
  query: string;
  matches: string[];
  selected: number;
}

interface InputFieldInternalState {
  buffer: string;
  cursor: number;
  picker: PickerState | null;
  maxSuggestions: number;
}

const INPUT_PREFIX = '> ';

export class InputHandler {
  public inputQueue: ManagedUserInputQueue;

  private state: InputState;
  private fieldState: InputFieldInternalState;
  private readonly context: AgentContext;
  private readonly inputStream: ReadStream = stdin;

  constructor(context: AgentContext, inputStream: ReadStream = stdin) {
    this.inputStream = inputStream;
    this.context = context;
    this.state = { paused: false };
    this.fieldState = {
      buffer: '',
      cursor: 0,
      picker: null,
      maxSuggestions: 8,
    };

    if (!this.inputStream.isTTY) {
      stdout.write(
        chalk.red('stdin not a TTY. CLI need interactive terminal.\n')
      );
      process.exit(1);
    }

    this.inputStream.setRawMode(true);
    this.inputStream.resume();
    this.inputStream.setEncoding('utf8');

    this.inputQueue = context.createUserInputQueue();

    emitKeypressEvents(this.inputStream);
    stdin.on('keypress', this.handlePollInput.bind(this));
  }

  public pauseInputPolling(): void {
    this.state.paused = true;
  }

  public resumeInputPolling(): void {
    this.state.paused = false;
  }

  public syncInputField(): void {
    this.context.shellBuffer.setInputBox({
      text: this.fieldState.buffer,
      cursor: this.fieldState.cursor,
      prefix: INPUT_PREFIX,
      pickerLines: this.buildPickerLines(),
    });
  }

  private buildPickerLines(): string[] | undefined {
    const picker = this.fieldState.picker;
    if (!picker) return undefined;

    const visible = picker.matches.slice(0, this.fieldState.maxSuggestions);
    if (visible.length === 0) {
      return [chalk.dim('  (no matches)')];
    }

    const lines = visible.map((match, i) => {
      const marker = i === picker.selected ? chalk.cyan('❯ ') : '  ';
      const body = i === picker.selected ? chalk.cyan(match) : chalk.dim(match);
      return `${marker}${body}`;
    });

    if (picker.matches.length > visible.length) {
      lines.push(
        chalk.dim(`  … ${picker.matches.length - visible.length} more`)
      );
    }

    return lines;
  }

  async startPicker(): Promise<void> {
    const { fileSelector } = this.context;

    this.fieldState.picker = {
      triggerIndex: this.fieldState.cursor - 1,
      query: '',
      matches: fileSelector.filter(''),
      selected: 0,
    };
    await fileSelector.reload(this.context.cwd, false);

    if (!this.fieldState.picker) return;

    this.fieldState.picker = {
      ...this.fieldState.picker,
      matches: fileSelector.filter(this.fieldState.picker.query ?? ''),
    };
    this.syncInputField();
  }

  private async promptUserForRequest(req: DequeuedRequest): Promise<string> {
    this.pauseInputPolling();

    const wasRaw = stdin.isRaw;
    if (wasRaw) {
      stdin.setRawMode(false);
    }

    try {
      stdout.write('\n');

      return await select<string>({
        message: req.prompt,
        choices: req.options.map(o => ({ name: o.text, value: o.option })),
      });
    } finally {
      if (wasRaw) stdin.setRawMode(true);

      this.resumeInputPolling();
    }
  }

  public async consumeUserInputQueue(): Promise<void> {
    while (true) {
      const req = await this.inputQueue.next();
      const choice = await this.promptUserForRequest(req);
      req.resolve(choice);
    }
  }

  private commitPicker(): void {
    const picker = this.fieldState.picker;
    if (!picker) return;

    const pick = picker.matches[picker.selected];
    if (!pick) {
      this.fieldState.picker = null;
      return;
    }
    const before = this.fieldState.buffer.slice(0, picker.triggerIndex);
    const after = this.fieldState.buffer.slice(this.fieldState.cursor);
    const insert = `@${pick} `;

    this.fieldState.buffer = before + insert + after;
    this.fieldState.cursor = before.length + insert.length;
    this.fieldState.picker = null;
  }

  public cancelPicker(): void {
    this.fieldState.picker = null;
  }

  private async handlePollInput(str: string, key: KeyEvent): Promise<void> {
    if (!key || this.state.paused) return;

    const { name: keyType } = key;

    if (key.ctrl && key.name === KeyType.KEY_C) {
      this.context.shellBuffer.dispose();
      process.exit(0);
    }

    if (this.fieldState.picker) {
      switch (keyType) {
        case KeyType.UP:
          {
            this.fieldState.picker = {
              ...this.fieldState.picker,
              selected: Math.max(0, this.fieldState.picker.selected - 1),
            };
            this.syncInputField();
          }
          return;
        case KeyType.DOWN:
          {
            this.fieldState.picker = {
              ...this.fieldState.picker,
              selected: Math.min(
                Math.min(
                  this.fieldState.picker.matches.length,
                  this.fieldState.maxSuggestions
                ) - 1,
                this.fieldState.picker.selected + 1
              ),
            };
            this.syncInputField();
          }
          return;
        case KeyType.ESCAPE:
          {
            this.cancelPicker();
            this.syncInputField();
          }
          return;
        default:
          if (
            keyType === KeyType.TAB ||
            (keyType === KeyType.RETURN &&
              this.fieldState.picker.matches.length)
          ) {
            this.commitPicker();
            this.syncInputField();
            return;
          }
      }
    }

    switch (keyType) {
      case KeyType.RETURN: {
        const line = this.fieldState.buffer;

        this.fieldState.buffer = '';
        this.fieldState.cursor = 0;
        this.fieldState.picker = null;

        await this.handleSubmit(line);
        this.syncInputField();
        return;
      }
      case KeyType.BACKSPACE: {
        if (this.fieldState.cursor > 0) {
          this.fieldState.buffer =
            this.fieldState.buffer.slice(0, this.fieldState.cursor - 1) +
            this.fieldState.buffer.slice(this.fieldState.cursor);
          this.fieldState.cursor -= 1;

          if (
            this.fieldState.picker &&
            this.fieldState.cursor <= this.fieldState.picker.triggerIndex
          ) {
            this.cancelPicker();
          } else {
            this.updatePicker();
          }
        }
        this.syncInputField();
        return;
      }
      case KeyType.LEFT: {
        if (this.fieldState.cursor > 0) {
          this.fieldState.cursor -= 1;
        }
        if (
          this.fieldState.picker &&
          this.fieldState.cursor <= this.fieldState.picker.triggerIndex
        ) {
          this.cancelPicker();
        } else {
          this.updatePicker();
        }
        this.syncInputField();
        return;
      }
      case KeyType.RIGHT: {
        if (this.fieldState.cursor < this.fieldState.buffer.length) {
          this.fieldState.cursor += 1;
        }
        this.updatePicker();
        this.syncInputField();
        return;
      }
      case KeyType.HOME: {
        this.fieldState.cursor = 0;
        this.cancelPicker();
        this.syncInputField();
        return;
      }
      case KeyType.END: {
        this.fieldState.cursor = this.fieldState.buffer.length;
        this.syncInputField();
        return;
      }
    }

    if (str && !key.ctrl && !key.meta && str.length === 1 && str >= ' ') {
      this.fieldState.buffer =
        this.fieldState.buffer.slice(0, this.fieldState.cursor) +
        str +
        this.fieldState.buffer.slice(this.fieldState.cursor);
      this.fieldState.cursor += 1;

      if (str === '@' && !this.fieldState.picker) {
        await this.startPicker();
      } else if (this.fieldState.picker) {
        if (str === ' ') {
          this.cancelPicker();
        } else {
          this.updatePicker();
        }
      }

      this.syncInputField();
      return;
    }
  }

  private updatePicker(): void {
    const { fileSelector } = this.context;
    const picker = this.fieldState.picker;
    if (!picker) return;

    const query = this.fieldState.buffer.slice(
      picker.triggerIndex + 1,
      this.fieldState.cursor
    );

    const matches = fileSelector.filter(query);
    const selected =
      picker.selected >= matches.length
        ? Math.max(0, matches.length - 1)
        : picker.selected;

    this.fieldState.picker = {
      ...picker,
      query,
      matches,
      selected,
    };
  }

  /**
   * Extracts the list of tagged files in the request.
   * Tagged files are mentioned like `@file-name`
   * @private
   */
  private extractAttachedFiles(input: string): string[] {
    const re = /@(\S+)/g;
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const path = m[1].replace(/[.,;:!?)\]]+$/, '');

      if (this.context.fileSelector.files.includes(path)) {
        found.add(path);
      }
    }
    return [...found];
  }

  private buildContextSuffix(loaded: readonly LocalFile[]): string {
    if (!loaded.length) return '';
    const blocks = loaded.map(f =>
      f.error !== undefined
        ? `<file path="${f.path}" error="${f.error}" />`
        : `<file path="${f.path}">\n${f.content}\n</file>`
    );
    return `\n\n${blocks.join('\n\n')}\n\nWhen answering, quote the relevant portions of the file(s) above verbatim in your response, using fenced code blocks.`;
  }

  private async handleSubmit(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;

    const mentionedLocalFilePaths = this.extractAttachedFiles(trimmed);
    const loadedFiles = await this.context.fileSelector.loadLocalFiles(
      mentionedLocalFilePaths
    );

    const refsLine = mentionedLocalFilePaths.length
      ? `\n\n${mentionedLocalFilePaths.map(p => chalk.cyan(`@${p}`)).join(', ')}`
      : '';
    this.context.shellBuffer.pushText(
      `${chalk.bold('you ') + chalk.dim('▸ ') + trimmed + refsLine}\n`
    );

    const contextSuffix = this.buildContextSuffix(loadedFiles);
    await this.context.queueUserMessage(trimmed + contextSuffix);
  }
}
