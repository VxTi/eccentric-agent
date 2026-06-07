import { type IToolBase } from './tool-base';
import CreateFile from '../file-system/create-file';
import CreateTaskList from '../tasks/create-task-list';
import FindFile from '../file-system/find-file';
import FindInFile from '../file-system/find-in-file';
import GetUserLocation from '../get-user-location';
import GetUserTime from '../get-user-time';
import InsertInFile from '../file-system/insert-in-file';
import PromptUserOptions from '../prompt-user-options';
import ReadFile from '../file-system/read-file';
import ReplaceInFile from '../file-system/replace-in-file';
import Shell from '../shell';
import SpawnAgents from '../spawn-agent';
import UpdateTaskList from '../tasks/update-task-list';
import WebFetch from '../web-fetch';
import WebSearch from '../web-search';
import ListMcpTools from '../mcp/mcp-list-tools';
import CallMcpTool from '../mcp/mcp-tool-call';
import DiscoverMcpTool from '../mcp/mcp-tool-discovery';

export const agentTools: IToolBase[] = [
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

export const registry: IToolBase[] = [
  SpawnAgents,
  PromptUserOptions,
  Shell,
  InsertInFile,
  ReplaceInFile,
  CreateFile,
  ...agentTools,
];
