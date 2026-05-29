export type ErrorResult<T = undefined> = {
  ok: false;
  error: T;
};
export type SuccessResult<T> = {
  ok: true;
  data: T;
};
export type Result<Success, Error = string> = SuccessResult<Success> | ErrorResult<Error>;

export const Result = {
  Ok: <T = undefined>(data: T): SuccessResult<T> => ({
    ok: true,
    data,
  }),
  Error: <T>(error: T): ErrorResult<T> => ({
    ok: false,
    error,
  }),
};
