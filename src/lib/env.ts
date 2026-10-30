import { isNil } from '@vxti/typed';

export function requiredEnv(key: keyof NodeJS.ProcessEnv): string {
  const val = process.env[key];

  if (isNil(val)) throw new Error(`Env key '${key}' does not exist`);

  return val;
}
