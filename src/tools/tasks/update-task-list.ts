import * as z from 'zod';
import { acquireContextInstance } from '../../lib/events/context-acquisition';
import { type Task, TaskStatus } from '../../lib/tasks';
import { createTool } from '../common';

const statusNameMapping: Record<TaskStatus, string> = {
  [TaskStatus.PENDING]: 'Pending',
  [TaskStatus.IN_PROGRESS]: 'In Progress',
  [TaskStatus.COMPLETED]: 'Completed',
};

const inputSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z
          .string()
          .describe(
            'The `id` of the task to update, as set in `create_task_list`.'
          ),
        status: z
          .enum(TaskStatus)
          .describe('The new status for the referenced task.'),
      })
    )
    .min(1)
    .describe('The set of task status updates to apply.'),
});

const outputSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      status: z.enum(TaskStatus),
    })
  ),
});

export default createTool({
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
  mightRequireApproval: false,

  async handle(input) {
    const context = await acquireContextInstance();
    if (!context.taskList.hasTasks) {
      throw new Error(
        'No task list exists. Call `create_task_list` before updating tasks.'
      );
    }

    const tasks: Task[] = context.taskList.updateTasks(input.updates);

    return Promise.resolve({ tasks });
  },

  inputToString(input) {
    const lines = input.updates
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
      return `All ${tasks.length} tasks completed.`;
    }

    return `Task list updated — ${remaining} of ${tasks.length} task${tasks.length === 1 ? '' : 's'} remaining.`;
  },
});
