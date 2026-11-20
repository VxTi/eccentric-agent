import type { Notifier, NotifierChannel } from '../../events/notifier';
import { tool as createTool, type Tool, type ToolSet } from 'ai';
import chalk from 'chalk';
import { v7 as uuid } from 'uuid';
import { basicHighlightFormatting } from '../../../rendering/terminal-markdown-renderer/markdown-renderer';
import { emitMessage } from '../../events/messaging';
import { requestUserInput } from '../../events/user-input';
import { Result } from '../../result';
import {
  type SomeTool,
  type ToolChannelParams,
  ToolSelectionOption,
} from './tool-definition';

/**
 * Runs the approval flow for a single tool invocation: consults the tool's
 * `requiresApproval`, prompts the user when needed, and applies the chosen
 * option via `onOptionSelect` (whose side effects — e.g. shell's persisted
 * "trust this command" — must run on every path that executes the tool).
 * Returns `true` when execution may proceed.
 *
 * Shared between the primary agent loop and sub-agents so delegated tools are
 * gated by exactly the same prompts as inline ones.
 */
export async function approveToolUse(
  tool: SomeTool,
  input: unknown,
  channel: NotifierChannel<ToolChannelParams>
): Promise<boolean> {
  if (!(await tool.requiresApproval(input, channel))) return true;

  const options = await tool.approvalOptions(input, channel);

  const [chosen] = await requestUserInput({
    title: 'Approval required',
    description: `Tool \`${tool.name}\` requires approval:\n\n${tool.formatArguments(input)}`,
    options: options.map(opt => ({
      label: opt.text,
      value: opt.option,
    })),
    allowMultiple: false,
  });
  const selectionOption = await tool.onOptionSelect(
    input,
    chosen.value,
    channel
  );

  if (selectionOption === ToolSelectionOption.DENY) {
    channel.notify({
      content: chalk.red(
        `User denied tool execution for ${chalk.underline(tool.name)}`
      ),
      loading: false,
    });
    return false;
  }

  return true;
}

export function makeToolSet(
  tools: SomeTool[],
  notifier: Notifier,
  signal: AbortSignal
): ToolSet {
  return Object.fromEntries(
    tools.map(tool => [tool.internalName, makeTool(tool, notifier, signal)])
  );
}

function makeTool(
  tool: SomeTool,
  notifier: Notifier,
  signal: AbortSignal
): Tool {
  const { description, inputSchema, outputSchema, name } = tool;
  return createTool({
    description,
    inputSchema,
    outputSchema,
    execute: async (input: unknown) => {
      const toolCallId = uuid();

      const channel = notifier.subscribe(
        toolCallId,
        (message: ToolChannelParams) =>
          emitMessage({
            ...message,
            // Mark every message from a tool channel so the UI can collapse
            // consecutive completed tool calls into a single line.
            toolCall: tool.internalName,
            content: message.content.trim(),
            type: 'generic',
            id: toolCallId,
          })
      );
      const approved = await approveToolUse(tool, input, channel);
      if (!approved) {
        notifier.unsubscribe(toolCallId);
        return Result.Error(`User denied permission to run tool "${name}".`);
      }
      const result = await Result.trySafe(() =>
        tool.handle(input, channel, signal)
      );
      if (result.ok) {
        channel.notify({
          loading: false,
          content: `${basicHighlightFormatting('→')} ${tool.outputToString(result.data, channel, result.metadata).trim()}`,
        });
      } else {
        channel.notify({
          loading: false,
          failure: true,
          content: chalk.red(`\`${name}\` failed: ${result.error.trim()}`),
        });
      }
      notifier.unsubscribe(toolCallId);

      // Exclude metadata from result to omit from model context window.
      // Metadata is only present for passing data between functions within the same tool
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { metadata: _, ...safeResult } = result;
      return safeResult;
    },
  });
}
