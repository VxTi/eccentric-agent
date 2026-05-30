import { type IToolBase } from './tool-base';
import CreateFile from '../create-file';
import CreateTaskList from '../tasks/create-task-list';
import FindFile from '../find-file';
import FindInFile from '../find-in-file';
import GetUserLocation from '../get-user-location';
import GetUserTime from '../get-user-time';
import InsertInFile from '../insert-in-file';
import PromptUserOptions from '../prompt-user-options';
import ReadFile from '../read-file';
import ReplaceInFile from '../replace-in-file';
import Shell from '../shell';
import SpawnAgents from '../spawn-agents';
import UpdateTaskList from '../tasks/update-task-list';
import WebFetch from '../web-fetch';
import WebSearch from '../web-search';

export const agentTools = [
  FindFile,
  FindInFile,
  ReadFile,
  WebSearch,
  WebFetch,
  GetUserTime,
  GetUserLocation,
  CreateTaskList,
  UpdateTaskList,
] satisfies IToolBase[];

export const toolRegistry = [
  PromptUserOptions,
  Shell,
  InsertInFile,
  ReplaceInFile,
  CreateFile,
  SpawnAgents,
  ...agentTools,
] satisfies IToolBase[];
