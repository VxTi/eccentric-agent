export function requiredEnv(key: keyof NodeJS.ProcessEnv): string {
  const val = process.env[key];

  if (!val) throw new Error(`Env key does not exist: ${key}`);

  return val;
}
