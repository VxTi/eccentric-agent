import * as z from 'zod';
import { toolSchema } from '../lib/agent/mcp/models';
import { acquireContextInstance } from '../rendering/context';
import { createTool } from './common';

const inputSchema = z.object({
  mcpServer: z
    .string()
    .describe(
      'The name of the MCP server to list the tools in. This server is initially provided'
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
  mightRequireApproval: false,

  async handle({ mcpServer }) {
    const context = await acquireContextInstance();
    const [mcp] = context.mcpServers.filter(
      server => server.name === mcpServer
    );

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!mcp) {
      throw new Error(`MCP "${mcpServer}" was not found`);
    }

    return {
      mcpServer,
      tools: mcp.listTools,
    };
  },

  inputToString({ mcpServer }) {
    return `Listing available MCP tools on "${mcpServer}".`;
  },

  outputToString({ mcpServer, tools }) {
    return `Found \`${tools.length}\` tools in \`${mcpServer}\``;
  },
});
