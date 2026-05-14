import { glob } from 'glob';
import { readFile } from 'node:fs/promises';
import { type AgentContext } from './common/AgentContext';

export type LocalFile =
  | { path: string; content: string; error?: undefined }
  | { path: string; content?: undefined; error: string };

export interface FileSelector {
  files: string[];
  reload: (cwd: string, force: boolean) => Promise<void>;
  filter: (query: string) => string[];
  loadLocalFiles: (paths: string[]) => Promise<LocalFile[]>;
}

export function createFileSelector(context: AgentContext): FileSelector {
  let files: string[] = [];

  const REFRESH_TTL_MS = 2_000;
  let lastRefreshMs = 0;
  let refreshingPromise: Promise<void> | null = null;

  const reload = async (cwd: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastRefreshMs < REFRESH_TTL_MS) return;
    if (refreshingPromise) return refreshingPromise;

    refreshingPromise = (async () => {
      files = await glob('**/*', {
        nodir: true,
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
        dot: false,
        cwd,
      });
      lastRefreshMs = Date.now();
    })();

    try {
      await refreshingPromise;
    } finally {
      refreshingPromise = null;
    }
  };

  // Initial load
  void reload(context.cwd, true);

  return {
    files,
    reload,
    filter: (query: string) => filterFiles(files, query),
    loadLocalFiles,
  };
}

function filterFiles(files: string[], query: string): string[] {
  const q = query.toLowerCase();
  if (!q) return files.slice(0, 200);
  return files
    .filter(f => f.toLowerCase().includes(q))
    .sort((a, b) => {
      const ai = a.toLowerCase().indexOf(q);
      const bi = b.toLowerCase().indexOf(q);
      if (ai !== bi) return ai - bi;
      return a.length - b.length;
    });
}

async function loadLocalFiles(paths: readonly string[]): Promise<LocalFile[]> {
  return Promise.all(
    paths.map(async (p): Promise<LocalFile> => {
      try {
        const content = await readFile(p, 'utf-8');
        return { path: p, content };
      } catch (err) {
        return { path: p, error: String(err) };
      }
    })
  );
}
