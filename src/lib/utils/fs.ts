import { access } from 'fs/promises';

export type FilePath = string & {};

export async function existsAsync(path: FilePath): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
