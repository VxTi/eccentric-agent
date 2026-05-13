import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { stdin, stdout } from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { type ReadStream } from 'node:tty';
import {
  type AgentContext,
  type DequeuedRequest,
  type ManagedUserInputQueue,
} from '../common/AgentContext';
import { type LocalFile } from '../file-selector';
import { type KeyEvent, KeyType } from './key-event';

export interface InputState {
  paused: boolean;
}

export class InputHandler {
  public inputQueue: ManagedUserInputQueue;

  private state: InputState;
  private readonly context: AgentContext;
  private readonly inputStream: ReadStream = stdin;

  constructor(context: AgentContext, inputStream: ReadStream = stdin) {
    this.inputStream = inputStream;
    this.context = context;
    this.state = { paused: false };

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

  async startPicker(): Promise<void> {
    const { renderer, fileSelector } = this.context;

    renderer.setState({
      picker: {
        triggerIndex: renderer.state.cursor - 1,
        query: '',
        matches: fileSelector.filter(''),
        selected: 0,
      },
    });
    await fileSelector.reload(renderer.context.cwd, false);

    if (!renderer.state.picker) return;

    renderer.setState(prev => ({
      picker: {
        matches: fileSelector.filter(prev.picker?.query ?? ''),
      },
    }));
    renderer.render();
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
    const { renderer } = this.context;
    const { state } = renderer;

    if (!state.picker) return;

    const pick = state.picker.matches[state.picker.selected];
    if (!pick) {
      renderer.setState(() => ({ picker: null }));
      return;
    }
    const before = state.buffer.slice(0, state.picker.triggerIndex);
    const after = state.buffer.slice(state.cursor);
    const insert = `@${pick} `;

    renderer.setState(() => ({
      buffer: before + insert + after,
      cursor: before.length + insert.length,
      picker: null,
    }));
  }

  public cancelPicker(): void {
    this.context.renderer.setState(() => ({ picker: null }));
  }

  private async handlePollInput(str: string, key: KeyEvent): Promise<void> {
    if (!key || this.state.paused) return;

    const { name: keyType } = key;

    if (key.ctrl && key.name === KeyType.KEY_C) {
      stdout.write('\n');
      process.exit(0);
    }

    const { renderer } = this.context;
    const { state } = renderer;

    if (state.picker) {
      switch (keyType) {
        case KeyType.UP:
          {
            renderer.setState(prev => ({
              picker: {
                selected: Math.max(0, (prev.picker?.selected ?? 0) - 1),
              },
            }));
            renderer.render();
          }
          return;
        case KeyType.DOWN:
          {
            renderer.setState(prev => ({
              picker: {
                selected: Math.min(
                  Math.min(
                    prev.picker?.matches.length ?? 0,
                    prev.maxSuggestions
                  ) - 1,
                  (prev.picker?.selected ?? 0) + 1
                ),
              },
            }));
            renderer.render();
          }
          return;
        case KeyType.ESCAPE:
          {
            this.cancelPicker();
            renderer.render();
          }
          return;
        default:
          if (
            keyType === KeyType.TAB ||
            (keyType === KeyType.RETURN && state.picker.matches.length)
          ) {
            this.commitPicker();
            renderer.render();
            return;
          }
      }
    }

    switch (keyType) {
      case KeyType.RETURN: {
        const line = renderer.state.buffer;

        renderer.setState({
          buffer: '',
          cursor: 0,
          picker: null,
          lastRenderedLines: 1,
        });
        await this.handleSubmit(line);
        renderer.render();
        return;
      }
      case KeyType.BACKSPACE: {
        if (renderer.state.cursor > 0) {
          renderer.setState(prev => ({
            buffer:
              prev.buffer.slice(0, prev.cursor - 1) +
              prev.buffer.slice(prev.cursor),
            cursor: prev.cursor - 1,
          }));

          if (state.picker && state.cursor <= state.picker.triggerIndex) {
            this.cancelPicker();
          } else {
            this.updatePicker();
          }
        }
        renderer.render();
        return;
      }
      case KeyType.LEFT: {
        if (state.cursor > 0) {
          renderer.setState(prev => ({ cursor: prev.cursor - 1 }));
        }
        if (state.picker && state.cursor <= state.picker.triggerIndex) {
          this.cancelPicker();
        } else {
          this.updatePicker();
        }
        renderer.render();
        return;
      }
      case KeyType.RIGHT: {
        if (state.cursor < state.buffer.length) {
          renderer.setState(prev => ({ cursor: prev.cursor + 1 }));
        }
        this.updatePicker();
        renderer.render();
        return;
      }
      case KeyType.HOME: {
        renderer.setState({ cursor: 0 });
        this.cancelPicker();
        renderer.render();
        return;
      }
      case KeyType.END: {
        renderer.setState(prev => ({
          cursor: prev.buffer.length,
        }));
        renderer.render();
        return;
      }
    }

    if (str && !key.ctrl && !key.meta && str.length === 1 && str >= ' ') {
      renderer.setState(prev => ({
        buffer:
          prev.buffer.slice(0, prev.cursor) +
          str +
          prev.buffer.slice(prev.cursor),
        cursor: prev.cursor + 1,
      }));

      if (str === '@' && !state.picker) {
        await this.startPicker();
      } else if (state.picker) {
        if (str === ' ') {
          this.cancelPicker();
        } else {
          this.updatePicker();
        }
      }

      renderer.render();
      return;
    }
  }

  private updatePicker(): void {
    const { renderer, fileSelector } = this.context;
    const { picker, buffer, cursor } = renderer.state;

    if (!picker) return;

    const query = buffer.slice(picker.triggerIndex + 1, cursor);

    renderer.setState({
      picker: {
        query,
        matches: fileSelector.filter(query),
      },
    });

    if (picker.selected >= picker.matches.length) {
      renderer.setState(prev => ({
        picker: {
          selected: Math.max(0, (prev.picker?.matches.length ?? 0) - 1),
        },
      }));
    }
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
    stdout.write('\n');
    const trimmed = line.trim();
    if (!trimmed) return;

    const mentionedLocalFilePaths = this.extractAttachedFiles(trimmed);
    const loadedFiles = await this.context.fileSelector.loadLocalFiles(
      mentionedLocalFilePaths
    );

    const refsLine = mentionedLocalFilePaths.length
      ? `\n\n${mentionedLocalFilePaths.map(p => chalk.cyan(`@${p}`)).join(', ')}`
      : '';
    stdout.write(
      `${chalk.bold('you ') + chalk.dim('▸ ') + trimmed + refsLine}\n`
    );

    const contextSuffix = this.buildContextSuffix(loadedFiles);
    await this.context.queueUserMessage(trimmed + contextSuffix);
  }
}
