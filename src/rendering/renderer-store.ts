import type { BufferFragments } from './fragments';

export interface RendererState {
  fragments: BufferFragments[];
  status: string | null;
  offset: number;
}

type Listener = () => void;

export class RendererStore {
  private state: RendererState;
  private listeners: Set<Listener>;

  constructor() {
    this.state = {
      fragments: [],
      status: null,
      offset: 0,
    };
    this.listeners = new Set();
  }

  public getState = (): RendererState => this.state;

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private commit(next: RendererState): void {
    this.state = next;
    this.listeners.forEach(l => l());
  }

  public pushFragments(...fragments: BufferFragments[]): void {
    this.commit({
      ...this.state,
      fragments: [...this.state.fragments, ...fragments],
    });
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
}
