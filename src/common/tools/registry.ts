import { type ToolBase } from '../tools';
import CreateFile from './create-file';
import CreateTaskList from './create-task-list';
import FindFile from './find-file';
import FindInFile from './find-in-file';
import InsertInFile from './insert-in-file';
import ReadFile from './read-file';
import Shell from './shell';
import UpdateTaskList from './update-task-list';
import WebFetch from './web-fetch';
import WebSearch from './web-search';

export const allTools: ToolBase[] = [
  new Shell(),
  new FindFile(),
  new FindInFile(),
  new InsertInFile(),
  new CreateFile(),
  new ReadFile(),
  new WebSearch(),
  new WebFetch(),
  new CreateTaskList(),
  new UpdateTaskList(),
];
