import { isNil } from '@vxti/typed';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDirname = '.agents';

function resolveAgentsPath(itemName: string): string | undefined {
  const candidates = [process.cwd(), os.homedir()].map(base =>
    path.join(base, rootDirname, itemName)
  );

  const existing = candidates.find(candidate => existsSync(candidate));
  if (isNil(existing)) return;

  return existing;
}

export function getMcpFilePath(): string | undefined {
  return resolveAgentsPath('mcp.json');
}

export function getSkillsRootDirPath(): string | undefined {
  return resolveAgentsPath('skills');
}
