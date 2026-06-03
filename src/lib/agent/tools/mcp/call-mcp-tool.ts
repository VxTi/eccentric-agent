import * as z from 'zod';
import { type MCP } from '../../mcp/mcp';
import { getMCPServer } from '../../mcp/server';
import { createTool, ToolSelectionOption } from '../common';

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

const enum ApprovalOption {
  APPROVE = 'approve',
  DENY = 'deny',
  TRUST = 'trust',
}

async function callTool(
  mcp: MCP,
  name: string,
  args: object
): Promise<unknown> {
  const tools = await mcp.listTools();
  const hasTool = tools.some(tool => tool.name === name);

  if (!hasTool) {
    throw new Error(`MCP server ${mcp.name} does not have tool ${name}`);
  }

  return await mcp.callTool(name, args);
}

// Might want to enrich this with properties, e.g., 'trust this specific invocation'
const trustedTools = new Set<string>();

function getInternalToolName(props: {
  mcpServer: string;
  toolName: string;
}): string {
  return `$${props.mcpServer}-${props.toolName}`;
}

function isTrusted(props: { mcpServer: string; toolName: string }): boolean {
  const key = getInternalToolName(props);
  return trustedTools.has(key);
}

function trustTool(props: { mcpServer: string; toolName: string }): void {
  const key = getInternalToolName(props);
  trustedTools.add(key);
}

export default createTool({
  internalName: 'call_mcp_tool',
  name: 'Call MCP tool',
  description:
    "Invoke a tool on a given MCP (Model Context Protocol) server. If you're not certain the tool exists, call the 'list_mcp_tools' tool first.",
  inputSchema,
  outputSchema,

  async handle({ mcpServer, toolName, arguments: args }) {
    const mcp = await getMCPServer(mcpServer);

    const result = await callTool(mcp, toolName, args);
    return {
      mcpServer,
      toolName,
      result,
    };
  },

  async requiresApproval({ mcpServer, toolName }) {
    const mcp = await getMCPServer(mcpServer);

    // If trusted, no approval needed
    if (isTrusted({ mcpServer, toolName })) return false;

    // If no auto-approve options are present, we require approval (always)
    if (!mcp.config.autoApprove?.length) return true;

    // Same here
    return mcp.config.autoApprove.includes(toolName);
  },

  approvalOptions({ mcpServer, toolName }) {
    return [
      {
        option: ApprovalOption.APPROVE,
        text: 'Approve',
      },
      {
        option: ApprovalOption.DENY,
        text: 'Deny',
      },
      {
        option: ApprovalOption.TRUST,
        text: `Trust \`${toolName}\` in \`${mcpServer}\``,
      },
    ];
  },

  onOptionSelect({ toolName, mcpServer }, option) {
    if (option === ApprovalOption.DENY) {
      return ToolSelectionOption.DENY;
    }

    if (option === ApprovalOption.TRUST) {
      trustTool({ mcpServer, toolName });
    }

    return ToolSelectionOption.ALLOW;
  },

  inputToString({ toolName, mcpServer }) {
    return `Calling MCP tool "${toolName}" on "${mcpServer}".`;
  },

  outputToString({ toolName, mcpServer }) {
    return `MCP tool call \`${toolName}\` in \`${mcpServer}\` finished`;
  },
});
