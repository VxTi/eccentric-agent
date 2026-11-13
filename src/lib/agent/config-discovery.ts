import { isNil } from '@vxti/typed';
import { existsSync } from 'node:fs';
import path from 'node:path';

const rootDirname = '.agents';

function resolveRootDirectoryPath(): string | undefined {
  const base = process.cwd();
  const rootDir = path.join(base, rootDirname);

  return existsSync(rootDir) ? rootDir : undefined;
}

export function getMcpFilePath(): string | undefined {
  const base = resolveRootDirectoryPath();
  if (isNil(base)) return;

  return path.join(base, 'mcp.json');
}

export function getSkillsRootDirPath(): string | undefined {
  const base = resolveRootDirectoryPath();
  if (isNil(base)) return;

  return path.join(base, 'skills');
}
