import type { NonEmptyArray } from '@vxti/typed';
import type { StatusFlag } from '../agent/agent-base';
import { EventEmitter } from 'node:events';

interface BitSetEventMap {
  'flag-change': [number];
}

export class BitSet<
  T extends number = number,
> extends EventEmitter<BitSetEventMap> {
  private readonly _noneFlag: T;
  private _flags: T;

  public constructor(noneFlag: T) {
    super();
    this._flags = noneFlag;
    this._noneFlag = noneFlag;
  }

  public has(flag: StatusFlag): boolean {
    return (this._flags & flag) !== 0;
  }

  public clearAndSet(...flags: NonEmptyArray<StatusFlag>): void {
    const result = flags.reduce<number>(
      (acc, flag) => acc | flag,
      this._noneFlag
    );
    this.commit(result);
  }

  public set(...flags: NonEmptyArray<StatusFlag>): void {
    const result = flags.reduce<number>((acc, flag) => acc | flag, this._flags);
    this.commit(result);
  }

  public get flags(): T {
    return this._flags;
  }

  public clear(...flags: NonEmptyArray<StatusFlag>): void {
    const mask = flags.reduce<number>((acc, flag) => acc | flag, 0);
    this.commit(this._flags & ~mask);
  }

  public update<A extends T, B extends Exclude<T, A>>(props: {
    set: NonEmptyArray<A>;
    clear: NonEmptyArray<B>;
  }): void {
    const clearMask = props.clear.reduce<number>((acc, flag) => acc | flag, 0);
    let result = this._flags & ~clearMask;
    result = props.set.reduce<number>((acc, flag) => acc | flag, result);
    this.commit(result);
  }

  public clearAll(): void {
    this.commit(this._noneFlag);
  }

  /**
   * Applies a new flag state atomically: assigns the state and emits a single
   * `flag-change` event, but only when the resulting state actually differs
   * from the current one.
   */
  private commit(next: number): void {
    if (next === this._flags) return;
    this._flags = next as T;
    this.emit('flag-change', this._flags);
  }
}
