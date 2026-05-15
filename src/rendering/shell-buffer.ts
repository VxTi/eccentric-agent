import { stdin, stdout } from 'node:process';
import type { ReadStream, WriteStream } from 'node:tty';
import { render, type Instance } from 'ink';
import { createElement } from 'react';
import type { AgentContext } from '../common/agent-context';
import { textBlock, type BufferFragments } from './fragments';
import { App } from './components/App';
import { RendererStore } from './renderer-store';

const ANSI_ALT_SCREEN_ENTER = '\x1b[?1049h\x1b[H\x1b[2J';
const ANSI_ALT_SCREEN_EXIT = '\x1b[?1049l';

export class ShellBuffer {
  public readonly outputStream: WriteStream;
  public readonly inputStream: ReadStream;
  private readonly store: RendererStore;
  private instance: Instance | null;

  constructor(
    outputStream: WriteStream = stdout,
    inputStream: ReadStream = stdin
  ) {
    this.outputStream = outputStream;
    this.inputStream = inputStream;
    this.store = new RendererStore();
    this.instance = null;
  }

  public mount(context: AgentContext): void {
    if (this.instance) return;
    this.outputStream.write(ANSI_ALT_SCREEN_ENTER);
    this.instance = render(createElement(App, { store: this.store, context }), {
      stdout: this.outputStream,
      stdin: this.inputStream,
      exitOnCtrlC: false,
      patchConsole: false,
    });
  }

  public pushText(raw: string): void {
    if (!raw) return;
    this.push(textBlock({ content: raw }));
  }

  public append(...fragments: BufferFragments[]): void {
    this.push(...fragments);
  }

  public push(...fragments: BufferFragments[]): void {
    this.store.pushFragments(...fragments);
  }

  public setStatus(text: string | null): void {
    this.store.setStatus(text);
  }

  public get heightOffset(): number {
    return this.store.getState().offset;
  }

  public setOffset(yAmount: number): void {
    this.store.setOffset(yAmount);
  }

  public clear(): void {
    this.store.clear();
    this.instance?.clear();
  }

  public dispose(): void {
    this.instance?.unmount();
    this.instance = null;
    this.outputStream.write(ANSI_ALT_SCREEN_EXIT);
  }
}
