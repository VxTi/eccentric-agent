import type { SomeTool } from './tool-definition';
import {
  createFile,
  createTaskList,
  delegateTask,
  findFile,
  findInFile,
  grep,
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
  grep,
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
  spawnSubAgents,
  delegateTask,
  promptUserOptions,
  shell,
  replaceInFile,
  createFile,
] as const;
