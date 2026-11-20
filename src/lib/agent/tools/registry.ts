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

export const subAgentTools = [
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
];

export const toolRegistry = [
  ...subAgentTools,
  spawnSubAgents,
  delegateTask,
  promptUserOptions,
  shell,
  replaceInFile,
  createFile,
];

export type ToolIdentifier = (typeof toolRegistry)[number]['internalName'];
