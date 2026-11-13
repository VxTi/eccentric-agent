import { isNil } from '@vxti/typed';

export interface Optional<T> {
  hasValue: boolean;

  value(): T;
}

export function optional<T>(value: T | undefined = undefined): Optional<T> {
  return {
    hasValue: value !== undefined,
    value: () => {
      if (isNil(value)) throw new Error('Optional value is undefined');
      return value;
    },
  };
}

export function wrapOptional<T>(fn: () => T | undefined): Optional<T> {
  return optional(fn());
}
