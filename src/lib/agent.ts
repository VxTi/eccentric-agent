import {
  generateText,
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  tool as createTool,
  type Tool,
  type ToolSet,
} from 'ai';
import * as z from 'zod';
import { agentTools, type IToolBase, type ToolChannelParams } from '../tools';
import { type NotifierChannel } from './notifier';
import { geminiProvider } from './provider';
import { Result } from './result';
import { emitAgentMessage } from './user-input';
import { v7 as uuid } from 'uuid';

const AGENT_MAX_LOOP_ITERATIONS = 200;

const PRIMARY_GOAL_TOOL_NAME = 'complete_goal';

export class Agent<T = string> {
  private readonly toolset: ToolSet;
  private readonly messages: ModelMessage[] = [];
  private readonly model: LanguageModel;

  private goalAccomplished = false;
  private result: string | undefined;
  private readonly taskId: string;

  constructor(
    private readonly goal: string,
    private readonly callback: (data: Result<T, Error>) => void,
    private readonly signal: AbortSignal,
    private readonly channel: NotifierChannel<ToolChannelParams>
  ) {
    this.taskId = uuid();
    this.toolset = this.constructToolset();
    this.model = geminiProvider('gemini-2.5-flash');
    this.messages = [
      { role: 'system', content: this.constructSystemPrompt() },
      { role: 'user', content: this.goal },
    ];
    this.process()
      .then((result: T) => this.callback(Result.Ok(result)))
      .catch((error: Error) => this.callback(Result.Error(error)));
  }

  private async process(): Promise<T> {
    let iterations = 0;
    emitAgentMessage({
      type: 'generic',
      id: this.taskId,
      content: `Running agent task ${this.goal}`,
    });
    while (iterations++ < AGENT_MAX_LOOP_ITERATIONS) {
      const { response } = await generateText({
        tools: this.toolset,
        allowSystemInMessages: true,
        model: this.model,
        messages: this.messages,
        abortSignal: this.signal,
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        },
        stopWhen: stepCountIs(20),
      });

      this.messages.push(...response.messages);
      response.messages.forEach(msg => {
        if (typeof msg.content === 'string') {
          this.channel.notify({ content: msg.content });
        }
      });

      if (this.goalAccomplished) {
        return this.result as T;
      }
    }

    throw new Error(
      `Agent exceeded maximum loop iterations (${AGENT_MAX_LOOP_ITERATIONS}) without accomplishing its goal.`
    );
  }

  private constructSystemPrompt(): string {
    return [
      `You are an autonomous agent operating in a tool-driven loop.`,
      ``,
      `## Your goal`,
      this.goal,
      ``,
      `## Operating procedure`,
      `- Each turn, decide on the single next action that advances the goal and call the appropriate tool. Do not stop or wait for further instructions — there is no user to respond to between turns.`,
      `- Inspect tool results carefully. If a tool fails, diagnose the failure and try a different approach rather than repeating the same call.`,
      `- Keep going until the goal is fully accomplished. Returning a plain text response without a tool call does NOT end the loop; only calling \`${PRIMARY_GOAL_TOOL_NAME}\` does.`,
      `- When, and only when, the goal is completely satisfied, call the \`${PRIMARY_GOAL_TOOL_NAME}\` tool with the final result. This terminates the loop.`,
      `- Do not call \`${PRIMARY_GOAL_TOOL_NAME}\` prematurely. If any required step is still pending, continue working.`,
      `- You have at most ${AGENT_MAX_LOOP_ITERATIONS} iterations; work efficiently and avoid redundant calls.`,
    ].join('\n');
  }

  private constructToolset(): ToolSet {
    return {
      [PRIMARY_GOAL_TOOL_NAME]: this.constructPrimaryGoalTool(),
      ...Object.fromEntries(
        agentTools.map((tool: IToolBase) => [
          tool.internalName,
          this.constructTool(tool),
        ])
      ),
    };
  }

  private constructTool(tool: IToolBase): Tool {
    const { inputSchema, description, outputSchema } = tool;

    return createTool({
      description,
      inputSchema,
      outputSchema,
      execute: async (input: unknown) => {
        return await tool.handle(input, this.channel).catch((err: Error) => {
          const message = `Tool "${tool.internalName}" failed: ${String(err)}`;

          return Result.Error(message);
        });
      },
    });
  }

  private constructPrimaryGoalTool(): Tool {
    const inputSchema = z.object({
      result: z
        .string()
        .describe('The final result of accomplishing the goal.'),
    });

    return createTool({
      description:
        `Call this tool when, and only when, the goal has been fully accomplished. ` +
        `Goal: ${this.goal}. ` +
        `Provide the final result; this will terminate the agent loop.`,
      inputSchema,
      execute: ({ result }: z.infer<typeof inputSchema>) => {
        this.result = result;
        this.goalAccomplished = true;
        return Result.Ok('Goal marked as accomplished.');
      },
    });
  }
}
