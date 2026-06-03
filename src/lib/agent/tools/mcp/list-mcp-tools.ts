import * as z from 'zod';
import { toolSchema } from '../../mcp/models';
import { getMCPServer } from '../../mcp/server';
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
  tools: z.array(toolSchema),
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
    const tools = await mcp.listTools();

    if (toolName) {
      return {
        mcpServer,
        tools: tools.filter(t => t.name === toolName),
      };
    }

    return {
      mcpServer,
      tools,
    };
  },

  inputToString({ mcpServer }) {
    return `Listing available MCP tools on "${mcpServer}".`;
  },

  outputToString({ mcpServer, tools }) {
    return `Found \`${tools.length}\` tools in \`${mcpServer}\``;
  },
});
