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
    this._flags = this._noneFlag;
    this.set(...flags);
  }

  public set(...flags: NonEmptyArray<StatusFlag>): void {
    this._flags = flags.reduce<T>(
      (acc, flag) => (acc | flag) as T,
      this._noneFlag
    );
    this.emit('flag-change', this._flags);
  }

  public get flags(): T {
    return this._flags;
  }

  public clear(...flags: NonEmptyArray<StatusFlag>): void {
    const result =
      this._flags &
      ~flags.reduce<number>((acc, flag) => acc | flag, this._noneFlag);

    this._flags = result as T;
  }

  public update<A extends T, B extends Exclude<T, A>>(props: {
    set: NonEmptyArray<A>;
    clear: NonEmptyArray<B>;
  }): void {
    this.clear(...props.clear);
    this.set(...props.set);
  }

  public clearAll(): void {
    this._flags = this._noneFlag;
  }
}
