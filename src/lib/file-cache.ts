import { stat } from 'fs/promises';
import path from 'node:path';
import { type AgentContext } from '../common/agent-context';

export class FileCache {
  private readonly context: AgentContext;
  private readonly cache: Map<string, number>;

  constructor(context: AgentContext) {
    this.context = context;
    this.cache = new Map<string, number>();
  }

  private toAbsolutePath(filePath: string): string {
    if (path.isAbsolute(filePath)) return filePath;

    return path.join(this.context.cwd, filePath);
  }

  // Ensures the potentially cached file hasn't been recently modified
  // to ensure insertion collisions
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

  /**
   * Updates the recently modified cache for the given file with the provided time
   */
  public set(absolutePath: string, modificationTimeMs: number): void {
    this.cache.set(absolutePath, modificationTimeMs);
  }

  /**
   * Updates the file cache for the given file path with the current time
   */
  public async update(absolutePath: string): Promise<void> {
    const after = await stat(absolutePath);
    this.set(absolutePath, after.mtimeMs);
  }
}
