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
  delegateTask,
  promptUserOptions,
  shell,
  replaceInFile,
  createFile,
  ...subAgentTools,
];

export type ToolIdentifier = (typeof toolRegistry)[number]['internalName'];
