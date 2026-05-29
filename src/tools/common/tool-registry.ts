import { type ToolBase } from './tool-base';
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
  new FindFile(),
  new FindInFile(),
  new ReadFile(),
  new WebSearch(),
  new WebFetch(),
  new GetUserTime(),
  new GetUserLocation(),
] satisfies ToolBase[];

export const toolRegistry = [
  ...agentTools,
  new Shell(),
  new InsertInFile(),
  new ReplaceInFile(),
  new CreateFile(),
  new CreateTaskList(),
  new UpdateTaskList(),
  new PromptUserOptions(),
  new SpawnAgents(),
] satisfies ToolBase[];
