import { generateText, Output } from 'ai';
import * as z from 'zod';
import { Result } from '../../../result';
import { getMCPServer, type McpTool } from '../../mcp/mcp';
import { geminiProvider } from '../../provider';
import { createTool } from '../common';

const inputSchema = z.object({
  mcpServer: z
    .string()
    .describe('Name of the MCP server to search for a matching tool in.'),
  task: z
    .string()
    .describe(
      'Natural-language description of what the agent wants to accomplish on this MCP server. Used to select the most appropriate tool.'
    ),
});

const outputSchema = z.object({
  mcpServer: z.string(),
  toolName: z
    .string()
    .nullable()
    .describe(
      'The name of the best-matching MCP tool, or null when no tool on this server is a plausible match for the task.'
    ),
  description: z.string().nullable(),
  reasoning: z
    .string()
    .describe('Short explanation of why this tool was selected.'),
  resolvedBy: z.enum(['only-tool', 'exact-name', 'llm', 'none']),
});

const selectionSchema = z.object({
  toolName: z
    .string()
    .nullable()
    .describe(
      "The exact 'name' of the chosen tool from the provided list, or null if none plausibly fits."
    ),
  reasoning: z
    .string()
    .describe('Concise justification, one or two sentences.'),
});

async function listAllTools(mcpServer: string): Promise<McpTool[]> {
  const mcp = await getMCPServer(mcpServer);
  const all = new Map<string, McpTool>();

  let cursor: string | undefined;
  do {
    const { tools, nextCursor } = await mcp.withAuth(() =>
      mcp.client.listTools({ cursor })
    );
    tools.forEach(t => all.set(t.name, t));
    cursor = nextCursor;
  } while (cursor);

  return Array.from(all.values());
}

function findExactNameMatch(
  task: string,
  tools: McpTool[]
): McpTool | undefined {
  const haystack = task.toLowerCase();
  const candidates = tools.filter(t => haystack.includes(t.name.toLowerCase()));

  if (candidates.length !== 1) return undefined;
  return candidates[0];
}

export default createTool({
  internalName: 'discover_mcp_tool',
  name: 'Discover MCP tool',
  description:
    'Given a natural-language task and an MCP server, identify which tool on that server best fits the task. Use this before `call_mcp_tool` when you are unsure which tool to invoke. Returns the selected tool name and a short reasoning, or null when no tool is a plausible match.',
  inputSchema,
  outputSchema,
  quiet: true,

  async handle({ mcpServer, task }, _channel, signal) {
    const tools = await listAllTools(mcpServer);

    if (tools.length === 0) {
      return Result.Ok({
        mcpServer,
        toolName: null,
        description: null,
        reasoning: `MCP server "${mcpServer}" exposes no tools.`,
        resolvedBy: 'none' as const,
      });
    }

    if (tools.length === 1) {
      const tool = tools[0]!;
      return Result.Ok({
        mcpServer,
        toolName: tool.name,
        description: tool.description ?? null,
        reasoning: 'Only one tool is available on this server.',
        resolvedBy: 'only-tool' as const,
      });
    }

    const exact = findExactNameMatch(task, tools);
    if (exact) {
      return Result.Ok({
        mcpServer,
        toolName: exact.name,
        description: exact.description ?? null,
        reasoning: `Task references tool name "${exact.name}" verbatim.`,
        resolvedBy: 'exact-name' as const,
      });
    }

    const catalog = tools
      .map(
        t =>
          `- ${t.name}: ${t.description?.trim().replace(/\s+/g, ' ') ?? '(no description)'}`
      )
      .join('\n');

    const {
      output: { toolName, reasoning },
    } = await generateText({
      model: geminiProvider('gemini-2.5-flash-lite'),
      output: Output.object({
        schema: selectionSchema,
      }),
      abortSignal: signal,
      system:
        'You select the single best MCP tool for a given task. Choose only from the provided list. If no tool is a plausible match, return null. Never invent tool names.',
      prompt: `MCP server: ${mcpServer}\nTask: ${task}\n\nAvailable tools:${catalog}`,
    });

    const selected = toolName
      ? tools.find(t => t.name === toolName)
      : undefined;

    if (!selected) {
      return Result.Ok({
        mcpServer,
        toolName: null,
        description: null,
        reasoning:
          reasoning || 'No tool on this server plausibly matches the task.',
        resolvedBy: 'none' as const,
      });
    }

    return Result.Ok({
      mcpServer,
      toolName: selected.name,
      description: selected.description ?? null,
      reasoning,
      resolvedBy: 'llm' as const,
    });
  },

  inputToString({ mcpServer, task }) {
    return `Finding the best MCP tool in \`${mcpServer}\` for: ${task}`;
  },

  outputToString({ mcpServer, toolName, resolvedBy }) {
    if (!toolName) {
      return `No matching tool found in \`${mcpServer}\``;
    }
    const suffix =
      resolvedBy === 'llm'
        ? ''
        : ` (resolved by ${resolvedBy.replace('-', ' ')})`;
    return `Selected MCP tool \`${toolName}\` from \`${mcpServer}\`${suffix}`;
  },
});
