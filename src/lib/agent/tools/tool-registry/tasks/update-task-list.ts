import * as z from 'zod';
import { acquireContextInstance } from '../../../../events/context-acquisition';
import { ContextType } from '../../../../events/events';
import { Result } from '../../../../result';
import { type Task, TaskStatus } from '../../../../tasks';
import { createTool } from '../../common';

const statusNameMapping: Record<TaskStatus, string> = {
  [TaskStatus.PENDING]: 'Pending',
  [TaskStatus.IN_PROGRESS]: 'In Progress',
  [TaskStatus.COMPLETED]: 'Completed',
};

const TaskStatusUpdateSchema = z.object({
  id: z
    .string()
    .describe('The `id` of the task to update, as set in `create_task_list`.'),
  status: z
    .enum(TaskStatus)
    .describe('The new status for the referenced task.'),
});

const TaskStatusSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(TaskStatus),
});

const inputSchema = z.object({
  updates: z
    .array(TaskStatusUpdateSchema)
    .min(1)
    .describe('The set of task status updates to apply.'),
});

const outputSchema = z.object({
  tasks: z.array(TaskStatusSchema),
});

export const updateTaskList = createTool({
  internalName: 'update_task_list',
  name: 'Update Task List',
  description:
    'Updates the status of one or more tasks in the current task list. Pass an array of updates, each' +
    ` referencing a task by its \`id\` and giving the new \`status\` ("${TaskStatus.PENDING}", "${TaskStatus.IN_PROGRESS}", or` +
    ` "${TaskStatus.COMPLETED}"). Mark a task "${TaskStatus.IN_PROGRESS}" right before you start working on it and "${TaskStatus.COMPLETED}"` +
    ' immediately after it is finished — do not batch completions at the end. Fails if no task list' +
    ' has been created yet or if an `id` does not match any existing task.',
  inputSchema,
  outputSchema,

  async handle({ updates }) {
    const { taskList } = await acquireContextInstance(ContextType.AGENT);
    if (!taskList.hasTasks) {
      return Result.Error(
        'No task list exists. Call `create_task_list` before updating tasks.'
      );
    }

    const tasks: Task[] = taskList.updateTasks(updates);

    return Result.Ok({ tasks });
  },

  inputToString({ updates }) {
    const lines = updates
      .map(({ id, status }) => `  - [${id}] → ${statusNameMapping[status]}`)
      .join('\n');
    return `Update task list:\n${lines}`;
  },

  outputToString(output) {
    const { tasks } = output;
    const remaining = tasks.filter(
      t => t.status !== TaskStatus.COMPLETED
    ).length;
    if (remaining === 0) {
      return `All \`${tasks.length}\` tasks completed.`;
    }

    return `Task list updated — \`${remaining}\` of \`${tasks.length}\` task${tasks.length === 1 ? '' : 's'} remaining.`;
  },
});
