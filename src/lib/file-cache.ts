import { isNil } from '@vxti/typed';
import { stat } from 'fs/promises';

export type FilePath = string & {};
export type MutationTimestampMs = number & {};

export interface FileCacheEntry {
  path: FilePath;
  content: string;
  mutationTimestampMs: MutationTimestampMs;
}

// const FILE_CACHE_DURATION_MS = 1000 * 60 * 5; // 5 minutes

export class FileCache {
  constructor(
    private readonly cache: Map<FilePath, MutationTimestampMs> = new Map()
  ) {}

  public async isRecentlyModified(absolutePath: FilePath): Promise<boolean> {
    const stats = await stat(absolutePath);
    const cachedMtime = this.cache.get(absolutePath);

    if (isNil(cachedMtime)) return true; // We can't know

    if (stats.mtimeMs > cachedMtime) {
      this.cache.delete(absolutePath);
      return true;
    }
    return false;
  }

  public set(absolutePath: string, modificationTimeMs: number): void {
    this.cache.set(absolutePath, modificationTimeMs);
  }

  public async update(absolutePath: string): Promise<void> {
    const after = await stat(absolutePath);
    this.set(absolutePath, after.mtimeMs);
  }
}
