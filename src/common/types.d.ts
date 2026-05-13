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
