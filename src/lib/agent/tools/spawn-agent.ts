import * as z from 'zod';
import { Result } from '../../result';
import { Agent } from '../agent';
import { type NotifierChannel } from '../../events/notifier';
import { createTool, type ToolChannelParams } from './common';

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
  goal: string,
  channel: NotifierChannel<ToolChannelParams>,
  signal: AbortSignal
): Promise<Result<string, Error>> {
  return new Promise(resolve => {
    const controller = new AbortController();

    signal.addEventListener('abort', () => controller.abort());

    new Agent<string>(goal, resolve, controller.signal, channel);
  });
}

export default createTool({
  internalName: 'spawn_agents',
  name: 'Spawn Agents',
  description:
    'Spawns one or more independent sub-agents in parallel, each given an isolated goal. Every sub-agent' +
    ' runs its own tool-driven loop and returns a final textual result when its goal is accomplished.' +
    ' YOU MUST ALWAYS USE THIS TOOL whenever the task requires gathering, collating, or aggregating' +
    ' information from more than one source, file, topic, or input — including any request that asks you' +
    ' to "summarize", "compare", "audit", "survey", "research", "review", or otherwise combine findings' +
    ' across multiple distinct items. Do not attempt to aggregate such data inline in your own loop;' +
    ' delegate each independent piece of work to its own sub-agent here and synthesize their returned' +
    ' results. The tool is also appropriate whenever a larger problem can be decomposed into' +
    ' self-contained sub-problems that can run concurrently (e.g. researching several topics at once,' +
    ' drafting alternative solutions in parallel, or fanning out repetitive investigations across many' +
    ' inputs). Each sub-agent receives ONLY the goal you provide; it has no access to your conversation' +
    ' history, so make every goal fully self-contained, with all necessary context, constraints, and the' +
    ' exact shape of the expected result. The ONLY case in which you may skip this tool is genuinely' +
    ' trivial single-step work that does not involve aggregating data from multiple sources.',
  inputSchema,
  outputSchema,

  async handle({ agents }, channel, signal) {
    const result = await Promise.allSettled(
      agents.map(async ({ goal, name }) => {
        const result = await runSubAgent(goal, channel, signal);

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
    if (results.length === 0) return `No tasks were performed`;

    const failedTasks = results.filter(res => !res.success);

    if (failedTasks.length === 0) {
      return `All side tasks finished`;
    }

    return `\`${results.length - failedTasks.length}\` out of \`${results.length}\` tasks succeeded`;
  },
});
