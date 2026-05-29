import { z } from 'zod';
import { type AgentContext } from '../../rendering/context/agent-context';
import { type Task, TaskStatus } from './task-list';
import { ToolBase } from '../common/tool-base';

export default class CreateTaskListTool extends ToolBase<Input, Output> {
  constructor() {
    super({
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
      mightRequireApproval: false,
    });
  }

  public override async handle(
    input: Input,
    context: AgentContext
  ): Promise<Output> {
    const tasks: Task[] = input.tasks.map(task => ({
      id: task.id,
      description: task.description,
      status: TaskStatus.PENDING,
    }));

    context.taskList.set(tasks);

    return Promise.resolve({ tasks });
  }

  public override inputToString(input: Input): string {
    const lines = input.tasks
      .map(task => `  - [${task.id}] ${task.description}`)
      .join('\n');
    return `Create task list:\n${lines}`;
  }

  public override outputToString(output: Output): string {
    return `Created task list with ${output.tasks.length} task${output.tasks.length === 1 ? '' : 's'}.`;
  }
}

const inputSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z
          .string()
          .describe(
            'A short stable identifier for the task. Used later by `update_task_list` to reference it.'
          ),
        description: z
          .string()
          .describe(
            'A concise description of what completing the task entails.'
          ),
      })
    )
    .min(1)
    .describe(
      'The ordered list of tasks to track. Decompose the user request into discrete, verifiable steps.'
    ),
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
