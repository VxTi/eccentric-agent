import * as z from 'zod';
import { Result } from '../../../../result';
import { store } from '../../../../state';
import { describeTaskProgress, type Task, TaskStatus } from '../../../../tasks';
import { createTool } from '../../tool-definition';

const CreateTaskSchema = z.object({
  id: z
    .string()
    .describe(
      'A short stable identifier for the task. Used later by `update_task_list` to reference it.'
    ),
  description: z
    .string()
    .describe('A concise description of what completing the task entails.'),
  status: z
    .enum(TaskStatus)
    .optional()
    .describe(
      "The initial status of the task. Can be set if it is the first task that's being worked on"
    ),
});

const TaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(TaskStatus),
});

const inputSchema = z.object({
  tasks: z
    .array(CreateTaskSchema)
    .min(1)
    .describe(
      'The ordered list of tasks to track. Decompose the user request into discrete, verifiable steps.'
    ),
});

const outputSchema = z.object({
  tasks: z.array(TaskSchema),
  progress: z.string(),
});

export const createTaskList = createTool({
  internalName: 'create_task_list',
  name: 'Create Task List',
  description:
    'Creates a task list that tracks the work required to fulfil the current user request. Use this tool' +
    ' at the start of any non-trivial request that decomposes into multiple discrete steps. Each task' +
    ' must have a stable string `id` (e.g. "1", "2", "fetch-data") and a short human readable' +
    ' `description`. Newly created tasks start in the "pending" status. While a task list exists with' +
    ' any incomplete tasks, you MUST keep working until every task is marked "completed" — do not stop' +
    ' and wait for further user input. Use `update_task_list` to flip statuses to "in_progress" as you' +
    ' begin a task and to "completed" once it is done. Creating a new task list replaces any existing' +
    ' one.',
  inputSchema,
  outputSchema,

  handle({ tasks }) {
    const {
      agent: { taskList },
    } = store.getState().agent;
    const newList: Task[] = tasks.map(task => ({
      id: task.id,
      description: task.description,
      status: task.status ?? TaskStatus.PENDING,
    }));

    taskList.set(newList);

    return Result.Ok({
      data: {
        tasks: newList,
        progress: describeTaskProgress(newList),
      },
    });
  },

  inputToString({ tasks }) {
    return `Creating task list with ${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
  },

  outputToString({ tasks }) {
    const lines = tasks.map(task => `- ${task.description}`).join('\n');
    return `Created task list\n${lines}`;
  },
});
