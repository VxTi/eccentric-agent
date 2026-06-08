type MaybePromise<T> = T | Promise<T>;

export interface ApprovalOption<T extends string = string> {
  option: T;
  text: string;
}

export type UniqueArray<T, U extends any[] = []> = T extends [
  infer First,
  ...infer Rest,
]
  ? First extends U[number]
    ? [never, ...UniqueArray<Rest, U>] // Duplicate found
    : [First, ...UniqueArray<Rest, [...U, First]>] // Unique so far
  : T;

export type MakeOptional<In extends object, Fields extends keyof In> = Omit<
  In,
  Fields
> &
  Partial<Pick<In, Fields>>;

export type PromiseResult<T> = T extends Promise<infer F> ? F : never;

export interface Dimensions {
  width: number;
  height: number;
}
