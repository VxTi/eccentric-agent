import { textBlock, type BufferFragments } from './fragments';

export interface MessageState {
  fragments: BufferFragments[];
  status: string | null;
  offset: number;
}

type Listener = () => void;

export class MessageStore {
  private state: MessageState;
  private listeners: Set<Listener>;

  constructor() {
    this.state = {
      fragments: [],
      status: null,
      offset: 0,
    };
    this.listeners = new Set();
  }

  public getState = (): MessageState => this.state;

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private commit(next: MessageState): void {
    this.state = next;
    this.listeners.forEach(l => l());
  }

  public push(...fragments: BufferFragments[]): void {
    this.commit({
      ...this.state,
      fragments: [...this.state.fragments, ...fragments],
    });
  }

  public pushText(raw: string): void {
    if (!raw) return;
    this.push(textBlock({ content: raw }));
  }

  public clear(): void {
    this.commit({ ...this.state, fragments: [], offset: 0 });
  }

  public setStatus(status: string | null): void {
    this.commit({ ...this.state, status });
  }

  public setOffset(offset: number): void {
    this.commit({ ...this.state, offset: Math.max(0, offset) });
  }

  public get offset(): number {
    return this.state.offset;
  }
}
