import type { NotifierChannel } from '../../../events/notifier';
import { isEmptyArray } from '@vxti/typed';
import * as z from 'zod';
import { Result } from '../../../result';
import { SubAgent } from '../../sub-agent';
import { createTool, type ToolChannelParams } from '../tool-definition';

const agentSpecSchema = z.object({
  name: z
    .string()
    .describe(
      'A short, unique label for this sub-agent (e.g. `research-pricing`,' +
        ' `draft-readme`). Used only to identify its result in the output.'
    ),
  goal: z
    .string()
    .describe(
      'The complete, self-contained goal for this sub-agent. The sub-agent has NO access to your conversation' +
        ' history, so include every piece of context, constraint, and success criterion it needs. State' +
        ' explicitly what the final result should contain.'
    ),
});

const inputSchema = z.object({
  agents: z
    .array(agentSpecSchema)
    .describe(
      'A list of agents that have to perform specific tasks. All of the given agents must have tasks ' +
        'that are categorically different, to ensure the most optimal outcome of the requested task. ' +
        'This means tasks will have to be fragmented into more specific categories, before spawning an agent.'
    ),
});
const taskResultSchema = z.object({
  taskName: z.string(),
  taskResult: z.string(),
  success: z.boolean(),
});
type TaskResult = z.infer<typeof taskResultSchema>;

const outputSchema = z.object({
  results: z.array(taskResultSchema),
});

async function runSubAgent(
  summary: string,
  goal: string,
  channel: NotifierChannel<ToolChannelParams>,
  signal: AbortSignal
): Promise<Result<string, Error>> {
  return new Promise(resolve => {
    const controller = new AbortController();

    signal.addEventListener('abort', () => controller.abort());

    new SubAgent({
      summary,
      goal,
      callback: resolve,
      signal: controller.signal,
      channel,
    });
  });
}

export const spawnSubAgents = createTool({
  internalName: 'spawn_agents',
  name: 'Spawn Agents',
  description:
    'Spawns one or more independent, READ-ONLY sub-agents in parallel, each given an isolated goal.' +
    ' Every sub-agent runs its own tool-driven loop and returns a final textual result when its goal is' +
    ' accomplished. Reach for this tool when a task breaks into substantial, genuinely independent' +
    ' read-only pieces that are worth running concurrently — e.g. researching several unrelated topics' +
    ' at once, or fanning a repetitive investigation across many inputs. Weigh the cost first: each' +
    ' sub-agent is a full extra agent loop, so a few file reads or searches you can do directly in your' +
    ' own loop are cheaper done inline. Do NOT spawn an agent for work of one or two reads, for a' +
    ' search you could run yourself, or for pieces that depend on one another. These sub-agents cannot' +
    ' edit files, create files, or run shell commands: any task that must change the workspace belongs' +
    ' in `delegate_task`, not here. Each sub-agent receives ONLY the goal you provide; it has no access' +
    ' to your conversation history, so make every goal fully self-contained, with all necessary' +
    ' context, constraints, and the exact shape of the expected result.',
  inputSchema,
  outputSchema,

  async handle({ agents }, channel, signal) {
    const result = await Promise.allSettled(
      agents.map(async ({ goal, name }) => {
        const result = await runSubAgent(name, goal, channel, signal);

        return { taskName: name, result };
      })
    );

    const results: TaskResult[] = result
      .filter(res => res.status === 'fulfilled')
      .map(({ value: { result, taskName } }) => ({
        taskName,
        success: result.ok,
        taskResult: result.ok ? result.data : result.error.message,
      }));

    return Result.Ok({ results });
  },

  inputToString({ agents }): string {
    return `Running ${agents.length} side task${agents.length === 1 ? '' : 's'}`;
  },

  outputToString({ results }) {
    if (isEmptyArray(results)) return `No tasks were performed`;

    const failedTasks = results.filter(res => !res.success);

    if (isEmptyArray(failedTasks)) {
      return `All side tasks finished`;
    }

    return `\`${results.length - failedTasks.length}\` out of \`${results.length}\` tasks succeeded`;
  },
});
