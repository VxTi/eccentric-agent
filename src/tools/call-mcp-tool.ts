import * as z from 'zod';
import { getMCPServer, type MCP } from '../lib/agent/mcp/mcp';
import { createTool } from './common';

const inputSchema = z.object({
  mcpServer: z
    .string()
    .describe(
      'Name of the MCP server that was used to invoke this tool with. This property MUST be present'
    ),
  toolName: z.string().describe('The name of the MCP tool to call.'),
  arguments: z
    .record(z.string(), z.unknown())
    .describe(
      'The arguments to pass to the MCP tool, as a JSON object. This property MUST be present, and the data structure is provided by the list_mcp_tools action'
    ),
});

const outputSchema = z.object({
  mcpServer: z.string(),
  toolName: z.string(),
  result: z.unknown().describe('The result of the MCP tool call.'),
});

async function callTool(
  mcp: MCP,
  name: string,
  args: object
): Promise<unknown> {
  const hasTool = (await mcp.listTools()).some(tool => tool.name === name);

  if (!hasTool) {
    throw new Error(`MCP server ${mcp.name} does not have tool ${name}`);
  }

  return await mcp.callTool(name, args);
}

export default createTool({
  internalName: 'call_mcp_tool',
  name: 'Call MCP tool',
  description: 'Invoke a tool on a given MCP (Model Context Protocol) server.',
  inputSchema,
  outputSchema,

  async handle({ mcpServer, toolName, arguments: args }) {
    const mcp = await getMCPServer(mcpServer);

    if (!mcp) {
      throw new Error(`MCP "${mcpServer}" was not found`);
    }

    const result = await callTool(mcp, toolName, args);
    return {
      mcpServer,
      toolName,
      result,
    };
  },

  async requiresApproval({ mcpServer, toolName }) {
    const mcp = await getMCPServer(mcpServer);
    if (!mcp) {
      throw new Error(`MCP server '${mcpServer}' not found`);
    }
    if (!mcp.config.autoApprove?.length) return false;

    return mcp.config.autoApprove.includes(toolName);
  },

  inputToString({ toolName, mcpServer }) {
    return `Calling MCP tool "${toolName}" on "${mcpServer}".`;
  },

  outputToString({ toolName, mcpServer }) {
    return `MCP tool call \`${toolName}\` in \`${mcpServer}\` finished`;
  },
});
