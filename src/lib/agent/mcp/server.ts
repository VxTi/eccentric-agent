import first from 'lodash/first';
import { acquireContextInstance } from '../../events/context-acquisition';
import { type MessageNotifier } from '../../events/notifier';
import { type MCP } from './mcp';
import {
  initializationResponseSchema,
  listToolsResponseSchema,
  toolCallResponseSchema,
} from './models';
import {
  type IMCPTransport,
  McpMethod,
  TransportEvent,
} from './transport/common';
import { STDIOTransport } from './transport/stdio';
import { HttpTransport } from './transport/streamable';
import { type mcp } from './types';

const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = {
  name: 'eccentric-agent',
  version: '1.0.0',
};

export class MCPServer {
  private transport: IMCPTransport;
  private cachedTools: mcp.Tool[] = [];

  public metadata: mcp.ServerInfo | undefined;

  constructor(
    name: string,
    config: mcp.Config,
    signal: AbortSignal,
    notifier: MessageNotifier
  ) {
    this.transport = config.command
      ? new STDIOTransport(name, config, signal)
      : new HttpTransport(name, config, signal);

    this.transport.on(TransportEvent.ERROR, (err: string) =>
      notifier.notify(err)
    );
    signal.addEventListener('abort', () =>
      this.transport.controller.abort('Parent process exited')
    );
  }

  static async create(
    name: string,
    config: mcp.Config,
    signal: AbortSignal,
    notifier: MessageNotifier
  ): Promise<MCPServer> {
    const server = new MCPServer(name, config, signal, notifier);
    await server.initializeClient();
    await server.notifyServer();

    await server.listTools();

    return server;
  }

  private async notifyServer(): Promise<void> {
    await this.transport.makeRequest({
      method: McpMethod.NOTIFY_INITIALIZED,
    });
  }

  private async initializeClient(): Promise<void> {
    const res = await this.transport.makeRequest({
      method: McpMethod.INITIALIZE,
      decoder: initializationResponseSchema,
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          elicitation: {},
        },
        clientInfo: CLIENT_INFO,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to initialize client: ${String(res.error)}`);
    }

    this.metadata = res.data.result;
  }

  public async callTool(name: string, args: object): Promise<unknown> {
    const res = await this.transport.makeRequest({
      method: McpMethod.CALL_TOOL,
      decoder: toolCallResponseSchema,
      params: { name, arguments: args },
    });

    if (!res.ok || res.data.result.isError || !res.data.result.content) {
      throw new Error(`Failed to invoke tool`);
    }

    return res.data.result.content;
  }

  public async listTools(): Promise<mcp.Tool[]> {
    if (this.cachedTools.length > 0) {
      return this.cachedTools;
    }
    const res = await this.transport.makeRequest({
      method: McpMethod.LIST_TOOLS,
      decoder: listToolsResponseSchema,
    });
    if (!res.ok) return []; // Errors handled elsewhere.

    this.cachedTools = res.data.result.tools;

    return this.cachedTools;
  }
}

export async function getMCPServer(name: string): Promise<MCP> {
  const context = await acquireContextInstance();

  const mcp = first(context.mcpServers.filter(server => server.name === name));

  if (!mcp) {
    throw new Error(`MCP "${name}" was not found`);
  }
  return mcp;
}
