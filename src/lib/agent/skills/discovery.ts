import { compact, isNil } from '@vxti/typed';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { getSkillsRootDirPath } from '../config-discovery';
import type { AgentSkill } from './model';
import { readSkillFile } from './parser';

export async function discoverSkillFiles(): Promise<AgentSkill[]> {
  const directoryPath = getSkillsRootDirPath();
  if (isNil(directoryPath) || !existsSync(directoryPath)) {
    return [];
  }

  return discoverTopLevelSkills(directoryPath);
}

async function discoverTopLevelSkills(basePath: string): Promise<AgentSkill[]> {
  const skillFiles = await readdir(basePath).then(res =>
    res.filter(file => file.endsWith('.md'))
  );

  const skills = await Promise.all(
    skillFiles.map(async file => await readSkillFile(path.join(basePath, file)))
  );

  return compact(skills);
}
