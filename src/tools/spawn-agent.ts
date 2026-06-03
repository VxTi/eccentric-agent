import * as z from 'zod';
import { Agent } from '../lib/agent/agent';
import { type NotifierChannel } from '../lib/events/notifier';
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
  agent: agentSpecSchema,
});

const outputSchema = z.discriminatedUnion('ok', [
  z.object({
    name: z.string().describe('The label of the sub-agent.'),
    ok: z.literal(true),
    result: z.string().describe('The final result produced by the sub-agent.'),
  }),
  z.object({
    name: z.string().describe('The label of the sub-agent.'),
    ok: z.literal(false),
    error: z
      .string()
      .describe('The error message describing why the sub-agent failed.'),
  }),
]);

async function runSubAgent(
  name: string,
  goal: string,
  channel: NotifierChannel<ToolChannelParams>
): Promise<z.infer<typeof outputSchema>> {
  return new Promise(resolve => {
    const controller = new AbortController();

    new Agent<string>(
      goal,
      result => {
        if (result.ok) {
          resolve({ name, ok: true, result: result.data });
        } else {
          resolve({ name, ok: false, error: result.error.message });
        }
      },
      controller.signal,
      channel
    );
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

  async handle({ agent: { goal, name } }, channel) {
    return await runSubAgent(name, goal, channel);
  },

  inputToString({ agent: { goal } }): string {
    return `Running side task \`${goal}\``;
  },

  outputToString({ ok, name }) {
    if (!ok) {
      return `Failed to finalize side task \`${name}\``;
    }

    return `Side task \`${name}\` succeeded`;
  },
});
