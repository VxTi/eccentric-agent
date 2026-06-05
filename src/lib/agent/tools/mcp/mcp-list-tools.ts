import compact from 'lodash/compact';
import * as z from 'zod';
import { getMCPServer, type McpTool } from '../../mcp/mcp';
import { createTool } from '../common';

const inputSchema = z.object({
  mcpServer: z
    .string()
    .describe(
      'The name of the MCP server to list the tools in. This server is initially provided'
    ),
  toolName: z
    .string()
    .optional()
    .describe(
      'Optional name of a specific tool. When set, the full input/output schemas for that tool are returned. When omitted, only tool names and descriptions are returned.'
    ),
});

const summaryToolSchema = z.object({
  name: z.string(),
  description: z.optional(z.string()),
});

const detailedToolSchema = z.object({
  name: z.string(),
  description: z.optional(z.string()),
  inputSchema: z.string(),
  outputSchema: z.optional(z.string()),
});

const outputSchema = z.object({
  mcpServer: z.string(),
  tools: z.array(z.union([detailedToolSchema, summaryToolSchema])),
});

export default createTool({
  internalName: 'list_mcp_tools',
  name: 'List MCP tools',
  description:
    "List tools available on a given MCP (Model Context Protocol) server. Call without 'toolName' to get a compact list of tool names and descriptions. Call again with a specific 'toolName' to retrieve that tool's full input/output schemas (as JSON-encoded strings) before invoking it via 'call_mcp_tool'.",
  inputSchema,
  outputSchema,

  async handle({ mcpServer, toolName }) {
    const mcp = await getMCPServer(mcpServer);
    const allTools = new Map<string, McpTool>();

    let cursor: string | undefined;
    do {
      const { tools, nextCursor } = await mcp.withAuth(() =>
        mcp.client.listTools({ cursor })
      );
      tools.forEach(t => allTools.set(t.name, t));
      cursor = nextCursor;
    } while (cursor);

    if (toolName) {
      const tool = allTools.get(toolName);
      return {
        mcpServer,
        tools: compact([
          tool && {
            name: tool.name,
            description: tool.description,
            inputSchema: JSON.stringify(tool.inputSchema),
            outputSchema: tool.outputSchema
              ? JSON.stringify(tool.outputSchema)
              : undefined,
          },
        ]),
      };
    }

    return {
      mcpServer,
      tools: Array.from(allTools.values()).map(tool => ({
        name: tool.name,
        description: tool.description,
      })),
    };
  },

  inputToString({ mcpServer, toolName }) {
    return toolName
      ? `Retrieving schema for MCP tool \`${toolName}\` in \`${mcpServer}\``
      : `Viewing available MCP tools in \`${mcpServer}\``;
  },

  outputToString({ mcpServer, tools }) {
    return `Found \`${tools.length}\` tool${tools.length === 1 ? '' : 's'} in \`${mcpServer}\``;
  },
});
