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
      'Optional name of the tool to filter by. This is useful if you need to know the input schema of the tool you wish to invoke'
    ),
});

const outputSchema = z.object({
  mcpServer: z.string(),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.optional(z.string()),
      inputSchema: z.any(),
      outputSchema: z.optional(z.any()),
    })
  ),
});

export default createTool({
  internalName: 'list_mcp_tools',
  name: 'List MCP tools',
  description:
    'List the tools available on a given MCP (Model Context Protocol) server.',
  inputSchema,
  outputSchema,

  async handle({ mcpServer, toolName }) {
    const mcp = await getMCPServer(mcpServer);
    const allTools = new Map<string, McpTool>();

    let cursor: string | undefined;
    do {
      const { tools, nextCursor } = await mcp.client.listTools({ cursor });
      tools.forEach(t => allTools.set(t.name, t));
      cursor = nextCursor;
    } while (cursor);

    if (toolName) {
      return {
        mcpServer,
        tools: compact([allTools.get(toolName)]),
      };
    }

    return {
      mcpServer,
      tools: Array.from(allTools.values()),
    };
  },

  inputToString({ mcpServer }) {
    return `Listing available MCP tools on "${mcpServer}".`;
  },

  outputToString({ mcpServer, tools }) {
    return `Found \`${tools.length}\` tools in \`${mcpServer}\``;
  },
});
