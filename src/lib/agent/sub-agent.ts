import {
  hasToolCall,
  isStepCount,
  type ModelMessage,
  streamText,
  tool as createTool,
  type Tool,
  type ToolSet,
} from 'ai';
import * as z from 'zod';
import { sleepFor } from '../utils/async-util';
import { getAppropriateModel, TaskComplexity } from './inference';
import {
  approveToolUse,
  subAgentTools,
  type ToolChannelParams,
  type SomeTool,
} from './tools';
import { type NotifierChannel } from '../events/notifier';
import { Result } from '../result';

const AGENT_MAX_LOOP_ITERATIONS = 200;

/**
 * Cap on model steps within a single `streamText` call. `isLoopFinished()` is
 * a no-op condition (`() => false`), so without this the inner tool loop only
 * ends when the model stops calling tools — a model that keeps calling tools
 * runs unbounded, and the outer iteration budget can never fire because
 * `result.steps` never resolves.
 */
const SUB_AGENT_MAX_STEPS = 500;

/** Default wait for a user to answer a sub-agent's approval prompt. */
const APPROVAL_TIMEOUT_MS = 60_000;

const PRIMARY_GOAL_TOOL_NAME = 'complete_goal';

export interface SubAgentOptions {
  readonly summary: string;
  readonly goal: string;
  readonly callback: (data: Result<string, Error>) => void;
  readonly signal: AbortSignal;
  readonly channel: NotifierChannel<ToolChannelParams>;
  /** Tools the sub-agent may use. Defaults to the read-only research set. */
  readonly tools?: SomeTool[];
  /**
   * Complexity tier for model selection. Lets callers route cheap tasks to a
   * smaller model and reserve the larger model for genuinely hard work.
   * Defaults to {@link TaskComplexity.MEDIUM}.
   */
  readonly complexity?: TaskComplexity;
}

export class SubAgent {
  private readonly toolset: ToolSet;
  private readonly messages: ModelMessage[] = [];

  private goalAccomplished = false;
  private result: string | undefined;

  private readonly goal: string;
  private readonly summary: string;
  private readonly callback: (data: Result<string, Error>) => void;
  private readonly signal: AbortSignal;
  private readonly channel: NotifierChannel<ToolChannelParams>;
  private readonly tools: SomeTool[];
  private readonly complexity: TaskComplexity;

  constructor(options: SubAgentOptions) {
    this.goal = options.goal;
    this.summary = options.summary;
    this.callback = options.callback;
    this.signal = options.signal;
    this.channel = options.channel;
    this.tools = options.tools ?? subAgentTools;
    this.complexity = options.complexity ?? TaskComplexity.MEDIUM;

    this.toolset = this.constructToolset();
    this.messages = [
      { role: 'system', content: this.constructSystemPrompt() },
      { role: 'user', content: this.goal },
    ];

    // Preserve the notified message's own `loading`/`failure` state; only the
    // content is decorated with the goal. Forcing `loading: true` here would
    // override the terminal `loading: false` notification core.ts emits when the
    // tool resolves, leaving the aggregated message spinning forever.
    this.channel.addInterceptor(message => ({
      ...message,
      content: `\`${this.summary}\` • ${message.content}`,
    }));

    this.process()
      .then((result: string) => this.callback(Result.Ok(result)))
      .catch((error: Error) => this.callback(Result.Error(error)));
  }

  private async process(): Promise<string> {
    let iterations = 0;
    while (iterations++ < AGENT_MAX_LOOP_ITERATIONS) {
      if (this.goalAccomplished) {
        return this.result ?? '';
      }
      this.throwIfAborted();
      const result = streamText({
        tools: this.toolset,
        allowSystemInMessages: true,
        model: getAppropriateModel(this.complexity),
        messages: this.messages,
        abortSignal: this.signal,
        reasoning: 'medium',
        onStepEnd: step => {
          this.messages.push(...step.response.messages);
        },
        onError: ({ error }) => {
          this.channel.notify({
            content: `An error occurred in agent task - ${String(error)}`,
          });
        },
        stopWhen: [
          // Stop immediately after `complete_goal` executes so the loop does
          // not burn an extra turn asking the model what to do next.
          hasToolCall(PRIMARY_GOAL_TOOL_NAME),
          isStepCount(SUB_AGENT_MAX_STEPS),
        ],
      });

      try {
        await result.steps;
      } catch (e) {
        this.throwIfAborted();
        this.channel.notify({
          content: `An error occurred in agent task - ${String(e)}`,
        });
        // Feed the failure back to the model, otherwise the next iteration
        // replays byte-identical messages and deterministically repeats the
        // same failing call until the iteration budget is exhausted.
        this.pushErrorNotice(
          `The previous step failed with an error: ${String(e)}. Diagnose the failure and take a different approach instead of repeating the same call.`
        );
        await sleepFor(1_000);
      }
    }

    throw new Error(
      `Agent exceeded maximum loop iterations (${AGENT_MAX_LOOP_ITERATIONS}) without accomplishing its goal.`
    );
  }

  private throwIfAborted(): void {
    if (this.signal.aborted) {
      throw new Error('Sub-agent aborted before accomplishing its goal.');
    }
  }

  private pushErrorNotice(content: string): void {
    const last = this.messages[this.messages.length - 1];
    // A persistently failing step produces no assistant messages between
    // retries, so without this guard the same notice would grow the context
    // by one message per retry iteration.
    if (last?.role === 'user' && last.content === content) return;
    this.messages.push({ role: 'user', content });
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
        this.tools.map((tool: SomeTool) => [
          tool.internalName,
          this.constructTool(tool),
        ])
      ),
    };
  }

  private constructTool(tool: SomeTool): Tool {
    const { inputSchema, description, outputSchema } = tool;

    return createTool({
      description,
      inputSchema,
      outputSchema,
      execute: async (input: unknown) => {
        this.channel.notify({
          content: tool.inputToString(input, this.channel),
        });

        // Sub-agents share the primary agent's approval flow, so delegated
        // tools are gated by the same prompts as inline ones.
        // The sub-agent's signal settles a pending approval prompt on abort,
        // so a cancelled task can never hang on a user who never answers.
        // An unanswered prompt also settles via the 1-minute default timeout,
        // surfacing to the sub-agent as a denial it can report and work around.
        const approvalResult = await approveToolUse({
          tool,
          input,
          channel: this.channel,
          signal: this.signal,
          timeoutMs: APPROVAL_TIMEOUT_MS,
        });
        if (!approvalResult.approved) {
          return Result.Error(approvalResult.reason);
        }

        const output = await Result.trySafe(() =>
          tool.handle(input, this.channel, this.signal)
        );
        if (!output.ok) {
          this.channel.notify({
            content: `Failed to invoke tool \`${tool.name}\` - ${output.error}`,
          });
          return output;
        }

        this.channel.notify({
          content: tool.outputToString(output, this.channel, output.metadata),
        });

        return output.data;
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
