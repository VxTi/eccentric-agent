import { type MaybePromise } from './types/types';

export type ErrorResult<T = undefined, TMeta = object> = {
  ok: false;
  error: T;
  metadata: TMeta;
};
export type SuccessResult<T, TMeta = object> = {
  ok: true;
  data: T;
  metadata: TMeta;
};

export type Result<Success, Error = string, TMeta = never> =
  | SuccessResult<Success, TMeta>
  | ErrorResult<Error, TMeta>;

export const Result = {
  Ok: <T = undefined, TMeta = never>(
    data: T,
    metadata: TMeta = undefined as never
  ): SuccessResult<T, TMeta> => ({
    ok: true,
    data,
    metadata,
  }),
  Error: <T, TMeta = never>(
    error: T,
    metadata: TMeta = undefined as never
  ): ErrorResult<T, TMeta> => ({
    ok: false,
    error,
    metadata,
  }),

  trySafe: async <TRes extends Result<any, string, any>>(
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
