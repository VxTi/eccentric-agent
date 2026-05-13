import { z } from 'zod';
import { type AgentContext } from '../AgentContext';
import { ToolBase } from '../tools';

export default class UpdateTaskListTool extends ToolBase<Input, Output> {
  constructor() {
    super(
      'update_task_list',
      'Update Task List',
      'Updates the status of one or more tasks in the current task list. Pass an array of updates, each' +
        ' referencing a task by its `id` and giving the new `status` ("pending", "in_progress", or' +
        ' "completed"). Mark a task "in_progress" right before you start working on it and "completed"' +
        ' immediately after it is finished — do not batch completions at the end. Fails if no task list' +
        ' has been created yet or if an `id` does not match any existing task.',
      inputSchema,
      outputSchema
    );
  }

  public override async handle(
    input: Input,
    context: AgentContext
  ): Promise<Output> {
    const existing = context.getTaskList();
    if (!existing) {
      throw new Error(
        'No task list exists. Call `create_task_list` before updating tasks.'
      );
    }

    const updated = context.updateTasks(input.updates);

    return { tasks: updated };
  }

  public override inputToString(input: Input): string {
    const lines = input.updates
      .map(update => `  - [${update.id}] → ${update.status}`)
      .join('\n');
    return `Update task list:\n${lines}`;
  }

  public override outputToString(output: Output): string {
    const remaining = output.tasks.filter(t => t.status !== 'completed').length;
    if (remaining === 0) {
      return `All ${output.tasks.length} tasks completed.`;
    }
    return `Task list updated — ${remaining} of ${output.tasks.length} task${output.tasks.length === 1 ? '' : 's'} remaining.`;
  }
}

const inputSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z
          .string()
          .describe('The `id` of the task to update, as set in `create_task_list`.'),
        status: z
          .enum(['pending', 'in_progress', 'completed'])
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
      status: z.enum(['pending', 'in_progress', 'completed']),
    })
  ),
});

type Output = z.infer<typeof outputSchema>;
