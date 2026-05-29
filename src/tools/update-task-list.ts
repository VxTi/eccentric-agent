import { z } from 'zod';
import { type AgentContext } from '../rendering/context/agent-context';
import { TaskStatus } from '../lib/task-list';
import { ToolBase } from './common/tool-base';

export default class UpdateTaskListTool extends ToolBase<Input, Output> {
  constructor() {
    super({
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
    });
  }

  public override async handle(
    input: Input,
    context: AgentContext
  ): Promise<Output> {
    if (!context.taskList.hasTasks) {
      throw new Error(
        'No task list exists. Call `create_task_list` before updating tasks.'
      );
    }

    const updated = context.taskList.updateTasks(input.updates);

    return Promise.resolve({ tasks: updated });
  }

  public override inputToString(input: Input): string {
    const lines = input.updates
      .map(({ id, status }) => `  - [${id}] → ${statusNameMapping[status]}`)
      .join('\n');
    return `Update task list:\n${lines}`;
  }

  public override outputToString(output: Output): string {
    const { tasks } = output;
    const remaining = tasks.filter(
      t => t.status !== TaskStatus.COMPLETED
    ).length;
    if (remaining === 0) {
      return `All ${tasks.length} tasks completed.`;
    }

    return `Task list updated — ${remaining} of ${tasks.length} task${tasks.length === 1 ? '' : 's'} remaining.`;
  }
}

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

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      status: z.enum(TaskStatus),
    })
  ),
});

type Output = z.infer<typeof outputSchema>;
