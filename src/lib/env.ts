import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { isNil } from '@vxti/typed';

export function requiredEnv(key: keyof NodeJS.ProcessEnv): string {
  const val = process.env[key];

  if (isNil(val)) throw new Error(`Env key '${key}' does not exist`);

  return val;
}

export function loadEnv(): void {
  const parsed = parseEnv(envFileContent());
  Object.entries(parsed).forEach(([k, v]) => {
    if (isNil(process.env[k])) process.env[k] = v;
  });
}

function envFileContent(): string {
  const path = envFilePath();
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function envFilePath(): string {
  const localEnvPath = join(process.cwd(), '.env');
  return existsSync(localEnvPath)
    ? localEnvPath
    : join(homedir(), '.agent', '.env');
}
