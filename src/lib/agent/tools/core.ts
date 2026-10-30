import { tool as createTool, type Tool, type ToolSet } from 'ai';
import chalk from 'chalk';
import { v7 as uuid } from 'uuid';
import { basicHighlightFormatting } from '../../../rendering/terminal-markdown-renderer/markdown-renderer';
import { emitMessage } from '../../events/messaging';
import { type Notifier } from '../../events/notifier';
import { requestUserInput } from '../../events/user-input';
import { Result } from '../../result';
import {
  type IToolDefinition,
  type ToolChannelParams,
  ToolSelectionOption,
} from './common';

export function makeToolSet(
  tools: IToolDefinition[],
  notifier: Notifier,
  signal: AbortSignal
): ToolSet {
  return Object.fromEntries(
    tools.map(tool => [tool.internalName, makeTool(tool, notifier, signal)])
  );
}

function makeTool(
  tool: IToolDefinition,
  notifier: Notifier,
  signal: AbortSignal
): Tool {
  const { description, inputSchema, outputSchema, name } = tool;
  return createTool({
    title: name,
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
            content: message.content.trim(),
            type: 'generic',
            id: toolCallId,
          })
      );

      const requiresApproval = await tool.requiresApproval(input, channel);
      if (requiresApproval) {
        const options = await tool.approvalOptions(input, channel);

        const [chosen] = await requestUserInput({
          title: 'Approval required',
          description: `Tool \`${tool.name}\` requires approval\n ${JSON.stringify(input)}`,
          options: options.map(opt => ({ label: opt.text, id: opt.option })),
          allowMultiple: false,
        });
        const selectionOption = await tool.onOptionSelect(
          input,
          chosen.id,
          channel
        );

        if (selectionOption === ToolSelectionOption.DENY) {
          channel.notify({
            content: chalk.red(
              `User denied tool execution for ${chalk.underline(tool.name)}`
            ),
            loading: false,
          });
          notifier.unsubscribe(toolCallId);
          return Result.Error(
            `User denied permission to run tool "${tool.internalName}".`
          );
        }

        if (selectionOption === ToolSelectionOption.ALWAYS_ALLOW) {
        }
      }

      channel.notify({
        loading: true,
        content: tool.inputToString(input, channel),
      });
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
          failure: true,
          content: chalk.red(`\`${tool.name}\` failed: ${result.error}`),
        });
      }
      notifier.unsubscribe(toolCallId);

      // Exclude metadata from result to omit from model context window.
      // Metadata is only present for passing data between functions within the same tool
      const { metadata: _, ...safeResult } = result;
      return safeResult;
    },
  });
}
