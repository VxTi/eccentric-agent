export class Queue<T> {
  private _queue: T[] = [];

  public isEmpty(): boolean {
    return this._queue.length === 0;
  }

  public enqueue(item: T): void {
    this._queue.push(item);
  }

  public dequeue(): T | undefined {
    return this._queue.shift();
  }

  public remaining(): number {
    return this._queue.length;
  }

  public clear(): void {
    this._queue.length = 0;
  }
}
