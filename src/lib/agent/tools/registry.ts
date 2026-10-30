import { type IToolDefinition } from './tool-definition';
import CreateFile from './tool-registry/file-system/create-file';
import CreateTaskList from './tool-registry/tasks/create-task-list';
import FindFile from './tool-registry/file-system/find-file';
import FindInFile from './tool-registry/file-system/find-in-file';
import GetUserLocation from './tool-registry/get-user-location';
import GetUserTime from './tool-registry/get-user-time';
import PromptUserOptions from './tool-registry/prompt-user-options';
import ReadFile from './tool-registry/file-system/read-file';
import ReplaceInFile from './tool-registry/file-system/replace-in-file';
import Shell from './tool-registry/shell';
import SpawnAgents from './tool-registry/spawn-agent';
import UpdateTaskList from './tool-registry/tasks/update-task-list';
import WebFetch from './tool-registry/web-fetch';
import WebSearch from './tool-registry/web-search';
import ListMcpTools from './tool-registry/mcp/mcp-list-tools';
import CallMcpTool from './tool-registry/mcp/mcp-tool-call';
import DiscoverMcpTool from './tool-registry/mcp/mcp-tool-discovery';

export const agentTools: IToolDefinition[] = [
  FindFile,
  FindInFile,
  ReadFile,
  WebSearch,
  WebFetch,
  GetUserTime,
  GetUserLocation,
  CreateTaskList,
  UpdateTaskList,
  DiscoverMcpTool,
  ListMcpTools,
  CallMcpTool,
];

export const toolRegistry: IToolDefinition[] = [
  ...agentTools,
  SpawnAgents,
  PromptUserOptions,
  Shell,
  ReplaceInFile,
  CreateFile,
];
