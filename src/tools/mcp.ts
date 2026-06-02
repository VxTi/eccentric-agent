import chalk from 'chalk';
import * as z from 'zod';
import { type MCP } from '../lib/agent/mcp/mcp';
import { toolSchema } from '../lib/agent/mcp/models';
import { acquireContextInstance } from '../rendering/context';
import { createTool } from './common';

enum ToolAction {
  LIST_TOOLS = 'listTools',
  CALL_TOOL = 'callTool',
}

const inputSchema = z.object({
  request: z.union([
    z.object({
      action: z.literal(ToolAction.LIST_TOOLS),
      mcpServer: z
        .string()
        .describe(
          'The name of the MCP server to list the tools in. This server is initially provided'
        ),
    }),
    z.object({
      action: z.literal(ToolAction.CALL_TOOL),
      mcpServer: z.string(),
      toolName: z.string().describe('The name of the MCP tool to call.'),
      args: z
        .object()
        .describe('The arguments to pass to the MCP tool, as a JSON object.'),
    }),
  ]),
});

const listMcpToolsOutputSchema = z.object({
  action: z.literal(ToolAction.LIST_TOOLS),
  tools: z.array(toolSchema),
});

const callMcpToolOutputSchema = z.object({
  action: z.literal(ToolAction.CALL_TOOL),
  result: z
    .record(z.string(), z.unknown())
    .describe('The result of the MCP tool call.'),
});

const outputSchema = z.object({
  value: z.union([listMcpToolsOutputSchema, callMcpToolOutputSchema]),
});

function listTools(mcp: MCP): z.infer<typeof listMcpToolsOutputSchema> {
  return {
    action: ToolAction.LIST_TOOLS,
    tools: mcp.listTools,
  };
}

async function callTool(
  mcp: MCP,
  name: string,
  args: object
): Promise<z.infer<typeof callMcpToolOutputSchema>> {
  const hasTool = mcp.listTools.some(tool => tool.name === name);

  if (!hasTool) {
    throw new Error(`MCP server ${mcp.name} does not have tool ${name}`);
  }

  const result: object = await mcp.callTool(name, args);
  return {
    action: ToolAction.CALL_TOOL,
    result,
  };
}

export default createTool({
  internalName: 'mcp',
  name: 'MCP',
  description: 'Interact with the MCP (Model Context Protocol) servers.',
  inputSchema,
  outputSchema,
  mightRequireApproval: false,

  async handle({ request }) {
    const context = await acquireContextInstance();

    const [mcp] = context.mcpServers.filter(
      server => server.name === request.mcpServer
    );

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!mcp) {
      throw new Error(`MCP "${request.mcpServer}" was not found`);
    }

    switch (request.action) {
      case ToolAction.LIST_TOOLS: {
        return {
          value: listTools(mcp),
        };
      }

      case ToolAction.CALL_TOOL: {
        const { toolName, args } = request;
        return {
          value: callTool(mcp, toolName, args),
        };
      }
    }
  },

  inputToString({ request }) {
    switch (request.action) {
      case ToolAction.LIST_TOOLS:
        return 'Listing available MCP tools.';
      case ToolAction.CALL_TOOL:
        return `Calling MCP tool "${request.toolName}".`;
      default:
        return 'Unknown MCP action.';
    }
  },

  outputToString({ value }) {
    switch (value.action) {
      case ToolAction.CALL_TOOL:
        return chalk.green(
          `MCP tool call successful. Result: ${JSON.stringify(value.result)}`
        );
      case ToolAction.LIST_TOOLS:
        return chalk.green(`Found ${value.tools.length} MCP tools.`);
      default:
        return 'Unknown MCP output.';
    }
  },
});
