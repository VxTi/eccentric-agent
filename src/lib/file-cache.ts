import { stat } from 'fs/promises';
import path from 'node:path';

export class FileCache {
  private readonly cwd: string;
  private readonly cache: Map<string, number>;

  constructor() {
    this.cwd = process.cwd();
    this.cache = new Map<string, number>();
  }

  private toAbsolutePath(filePath: string): string {
    if (path.isAbsolute(filePath)) return filePath;

    return path.join(this.cwd, filePath);
  }

  public async getCachedFilePath(filePath: string): Promise<string> {
    const absolutePath = this.toAbsolutePath(filePath);

    const stats = await stat(absolutePath);
    const cachedMtime = this.cache.get(absolutePath);

    if (cachedMtime !== undefined && stats.mtimeMs > cachedMtime) {
      throw new Error(
        `File '${absolutePath}' was modified on disk since it was last read. Re-read it before editing.`
      );
    }

    return absolutePath;
  }

  public set(absolutePath: string, modificationTimeMs: number): void {
    this.cache.set(absolutePath, modificationTimeMs);
  }

  public async update(absolutePath: string): Promise<void> {
    const after = await stat(absolutePath);
    this.set(absolutePath, after.mtimeMs);
  }
}
