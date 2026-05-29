import { z } from 'zod';
import { type AgentContext } from '../rendering/context';
import { Agent } from '../lib/agent';
import { ToolBase } from './common';

export default class SpawnAgentsTool extends ToolBase<Input, Output> {
  constructor() {
    super({
      internalName: 'spawn_agents',
      name: 'Spawn Agents',
      description:
        'Spawns one or more independent sub-agents in parallel, each given an isolated goal. Every sub-agent' +
        ' runs its own tool-driven loop and returns a final textual result when its goal is accomplished.' +
        ' Use this tool to decompose a larger problem into self-contained sub-problems that can be tackled' +
        ' concurrently — for example to research several topics at once, draft alternative solutions in' +
        ' parallel, or fan out repetitive investigations across many inputs. Each sub-agent receives ONLY the' +
        ' goal you provide; it has no access to your conversation history, so make every goal fully' +
        ' self-contained, with all necessary context, constraints, and the exact shape of the expected' +
        ' result. Avoid spawning sub-agents for trivial work you can do yourself in a single step.',
      inputSchema,
      outputSchema,
      mightRequireApproval: false,
    });
  }

  public override async handle(
    input: Input,
    context: AgentContext
  ): Promise<Output> {
    if (input.agents.length === 0) {
      throw new Error('At least one sub-agent must be provided.');
    }

    return await Promise.all(
      input.agents.map(({ name, goal }) =>
        this.runSubAgent(name, goal, context)
      )
    );
  }

  private runSubAgent(
    name: string,
    goal: string,
    context: AgentContext
  ): Promise<z.infer<typeof agentResultSchema>> {
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
        context,
        z.string()
      );
    });
  }

  public override inputToString(input: Input): string {
    if (input.agents.length === 1) {
      return `Spawning sub-agent \`${input.agents[0].name}\``;
    }
    return `Spawning \`${input.agents.length}\` sub-agents in parallel`;
  }

  public override outputToString(output: Output): string {
    const succeeded = output.filter(r => r.ok).length;
    const failed = output.length - succeeded;

    if (failed === 0) {
      return `\`${succeeded}\` sub-agent${succeeded === 1 ? '' : 's'} completed successfully`;
    }
    return `\`${succeeded}\` succeeded, \`${failed}\` failed`;
  }
}

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
    .min(1)
    .describe(
      'The list of sub-agents to spawn. Each runs independently and in parallel; there is no shared state' +
        ' between them, so do not split a single task that requires coordination across two agents.'
    ),
});

type Input = z.infer<typeof inputSchema>;

const agentResultSchema = z.discriminatedUnion('ok', [
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

const outputSchema = z
  .array(agentResultSchema)
  .describe(
    'One result entry per spawned sub-agent, in the same order as the input.'
  );

type Output = z.infer<typeof outputSchema>;
