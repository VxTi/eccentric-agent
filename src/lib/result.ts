import type { MaybePromise } from './types/types';

export type ErrorResult<T = undefined> = {
  ok: false;
  data?: never;
  error: T;
};
export type SuccessResult<T> = {
  ok: true;
  data: T;
  error?: never;
};

export type Result<Success, Error = string> =
  | SuccessResult<Success>
  | ErrorResult<Error>;

export const Result = {
  Ok: <T = undefined>(data: T): SuccessResult<T> => ({ ok: true, data }),
  Error: <T>(error: T): ErrorResult<T> => ({ ok: false, error }),

  trySafe: async <TRes extends Result<any>>(
    callback: () => MaybePromise<TRes>
  ): Promise<TRes> => {
    try {
      return await callback();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Result.Error(message) as TRes;
    }
  },
};
