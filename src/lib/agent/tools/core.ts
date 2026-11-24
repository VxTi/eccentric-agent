import type { Notifier, NotifierChannel } from '../../events/notifier';
import { tool as createTool, type Tool, type ToolSet } from 'ai';
import chalk from 'chalk';
import { v7 as uuid } from 'uuid';
import { basicHighlightFormatting } from '../../../rendering/terminal-markdown-renderer/markdown-renderer';
import { emitMessage } from '../../events/messaging';
import { requestUserInput } from '../../events/user-input';
import { Result } from '../../result';
import { MessageType } from '../../types/messages';
import type { ToolIdentifier } from './registry';
import {
  type SomeTool,
  type ToolChannelParams,
  ToolSelectionOption,
} from './tool-definition';

interface ToolApproval {
  approved: true;
  reason?: never;
}

interface ToolRejection {
  approved: false;
  reason: string;
}

export type ToolApprovalResult = ToolApproval | ToolRejection;

interface ApproveToolUseProps {
  tool: SomeTool;
  input: unknown;
  channel: NotifierChannel<ToolChannelParams>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

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
export async function approveToolUse({
  tool,
  input,
  channel,
  signal,
  timeoutMs,
}: ApproveToolUseProps): Promise<ToolApprovalResult> {
  if (!(await tool.requiresApproval(input, channel))) {
    return { approved: true };
  }

  const approvalOptions = await tool.approvalOptions(input, channel);
  const inputRequestResult = await requestUserInput({
    title: 'Approval required',
    description: `Tool \`${tool.name}\` requires approval:\n\n${tool.formatArguments(input)}`,
    options: approvalOptions.map(opt => ({
      label: opt.text,
      value: opt.option,
    })),
    allowMultiple: false,
    cancellable: true,
    signal,
    timeoutMs,
  }).then(res => res[0]);

  if (inputRequestResult.cancelled) {
    return {
      approved: false,
      reason: 'User cancelled approval request',
    };
  }

  const selectionOption = await tool.onOptionSelect(
    input,
    inputRequestResult.value,
    channel
  );

  if (selectionOption === ToolSelectionOption.DENY) {
    return {
      approved: false,
      reason: `User denied permission to run  \'${tool.name}\'`,
    };
  }

  return { approved: true };
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
            type: MessageType.GENERIC,
            // Mark every message from a tool channel so the UI can collapse
            // consecutive completed tool calls into a single line.
            toolCall: tool.internalName as ToolIdentifier,
            content: message.content.trim(),
            id: toolCallId,
          })
      );

      channel.notify({
        loading: true,
        content: tool.inputToString(input, channel),
      });

      const approvalResult = await approveToolUse({
        tool,
        input,
        channel,
        signal,
      });

      if (!approvalResult.approved) {
        notifier.unsubscribe(toolCallId);
        return Result.Error(approvalResult.reason);
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
