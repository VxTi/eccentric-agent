import type { SomeTool } from './tool-definition';
import {
  createFile,
  createTaskList,
  findFile,
  findInFile,
  getUserLocation,
  getUserTime,
  promptUserOptions,
  readFile,
  replaceInFile,
  shell,
  spawnSubAgents,
  updateTaskList,
  webFetch,
  webSearch,
  listMcpTools,
  callMcpTool,
  discoverMcpTool,
} from './tool-registry';
import { useSkill } from './tool-registry/skill';

export const subAgentTools: SomeTool[] = [
  findFile,
  findInFile,
  readFile,
  webSearch,
  webFetch,
  getUserTime,
  getUserLocation,
  createTaskList,
  updateTaskList,
  discoverMcpTool,
  listMcpTools,
  callMcpTool,
  useSkill,
] as const;

export const toolRegistry: SomeTool[] = [
  ...subAgentTools,
  useSkill,
  spawnSubAgents,
  promptUserOptions,
  shell,
  replaceInFile,
  createFile,
] as const;
