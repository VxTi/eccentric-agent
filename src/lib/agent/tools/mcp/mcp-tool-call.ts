import * as z from 'zod';
import { getMCPServer } from '../../mcp/mcp';
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
  result: z
    .string()
    .describe(
      'The JSON-encoded result of the MCP tool call. Parse it as JSON to read the structured content.'
    ),
});

const enum ApprovalOption {
  APPROVE = 'approve',
  DENY = 'deny',
  TRUST = 'trust',
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

  async handle({ mcpServer, toolName, arguments: args }, _, signal) {
    const mcp = await getMCPServer(mcpServer);

    const result = await mcp.withAuth(() =>
      mcp.client.callTool({ name: toolName, arguments: args }, { signal })
    );

    if (result.isError) {
      throw new Error(JSON.stringify(result.content));
    }

    return {
      mcpServer,
      toolName,
      result: JSON.stringify(result),
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
    return `Using MCP tool \`${toolName}\` from \`${mcpServer}\``;
  },

  outputToString({ toolName, mcpServer }) {
    return `Used MCP tool \`${toolName}\` from \`${mcpServer}\``;
  },
});
