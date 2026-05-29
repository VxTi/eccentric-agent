import { type ReadStream, type WriteStream } from 'node:tty';

type MaybePromise<T> = T | Promise<T>;

export interface ApprovalOption<T extends string = string> {
  option: T;
  text: string;
}

export interface UserInputRequest {
  readonly toolName: string;
  readonly prompt: string;
  readonly options: readonly ApprovalOption[];
}

export interface UserInputQueue {
  request(req: UserInputRequest): Promise<string>;
}

export type UniqueArray<T, U extends any[] = []> = T extends [infer First, ...infer Rest]
  ? First extends U[number]
    ? [never, ...UniqueArray<Rest, U>] // Duplicate found
    : [First, ...UniqueArray<Rest, [...U, First]>] // Unique so far
  : T;

export interface IO {
  inputStream: ReadStream;
  outputStream: WriteStream;
}
