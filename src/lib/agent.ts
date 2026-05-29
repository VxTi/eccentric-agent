import { tool as createTool, type Tool, type ToolSet } from 'ai';
import chalk from 'chalk';
import { formatMarkdown, previewArgs } from '../rendering/formatting';
import { type ToolBase, ToolSelectionOption } from '../tools/common/tool-base';
import { Result } from './result';

export class Agent<T> {
  private readonly toolset: ToolSet;

  constructor(
    private readonly goal: string,
    private readonly callback: (data: Result<T, Error>) => void
  ) {
    this.toolset = this.constructToolset();
    this.process()
      .then((result: T) => callback(Result.Ok(result)))
      .catch((error: Error) => callback(Result.Error(error)));
  }

  private async process(): Promise<T> {}

  private constructToolset(): ToolSet {
    return Object.fromEntries(
      toolRegistry.map((tool: ToolBase) => [
        tool.internalName,
        this.constructTool(tool),
      ])
    );
  }

  private constructTool(tool: ToolBase): Tool {
    return createTool({
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (input: unknown) => {
        const processed: unknown = await tool.inputSchema.parse(input);
        const needsApproval = await tool.requiresApproval(processed, runtime);

        if (needsApproval) {
          const options = await tool.approvalOptions(processed, runtime);
          const prompt = `tool "${tool.internalName}" requires approval — args: ${previewArgs(input)}`;

          const chosen = await runtime.inputQueue.request({
            toolName: tool.internalName,
            prompt,
            options,
          });
          const selectionOption = await tool.onOptionSelect(
            processed,
            chosen,
            runtime
          );

          if (selectionOption !== ToolSelectionOption.ALLOW) {
            return {
              error: `User denied permission to run tool "${tool.internalName}".`,
            };
          }
        }

        messageStore.pushText(
          `${formatMarkdown(tool.inputToString(processed))}`
        );

        let output: unknown;
        try {
          output = await tool.handle(processed, runtime);
        } catch (err) {
          const message = `Tool "${tool.internalName}" failed: ${String(err)}`;
          messageStore.pushText(chalk.red(`${message}\n`));
          return { error: message, ok: false };
        }

        const parsed = await tool.outputSchema.safeParseAsync(output);

        if (!parsed.success) {
          const message = `Tool "${tool.internalName}" returned an unexpected shape: ${String(parsed.error)}`;
          messageStore.pushText(chalk.red(`${message}\n`));
          return { error: message, ok: false, raw: output };
        }

        messageStore.pushText(
          `↳ ${formatMarkdown(tool.outputToString(parsed.data))}\n`
        );

        return parsed.data;
      },
    });
  }
}

const toolRegistry: ToolBase[] = [];
