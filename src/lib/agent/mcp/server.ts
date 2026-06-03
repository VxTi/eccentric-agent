import first from 'lodash/first';
import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import { acquireContextInstance } from '../../events/context-acquisition';
import { type MCP } from './mcp';
import {
  initializationResponseSchema,
  type JSONRPCSchema,
  listToolsResponseSchema,
  toolCallResponseSchema,
} from './models';
import { type mcp } from './types';

const enum McpMethod {
  INITIALIZE = 'initialize',
  NOTIFY_INITIALIZED = 'notifications/initialized',
  LIST_TOOLS = 'tools/list',
  CALL_TOOL = 'tools/call',
}

const messageIdRegistry: Partial<Record<McpMethod, number>> = {
  [McpMethod.INITIALIZE]: 1,
  [McpMethod.LIST_TOOLS]: 2,
  [McpMethod.CALL_TOOL]: 3,
};

const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = {
  name: 'eccentric-agent',
  version: '1.0.0',
};
const INCOMING_MESSAGE_EVENT_ID = 'incomingMessage';

export class MCPServer extends EventEmitter {
  private readonly process: ChildProcess;
  private processActive: boolean;
  private messageBuffer: string = '';
  private cachedTools: mcp.Tool[] = [];

  public metadata: mcp.ServerInfo | undefined;

  constructor(config: mcp.Config, signal: AbortSignal) {
    super();
    this.processActive = true;
    const controller = new AbortController();

    signal.addEventListener('abort', () => controller.abort());

    this.process = spawn(config.command, config.args, {
      shell: true,
      detached: true,
      signal: controller.signal,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        TERM: 'dumb',
        NO_COLOR: '1',
        CI: '1',
        ...(config.env ?? {}),
      },
    });
    this.process.unref();
    this.process.stdout?.on('data', (data: Buffer) => {
      this.messageBuffer += data.toString();
      this.parseAndEmitMessages();
    });

    this.process.on('close', () => (this.processActive = false));
  }

  static async create(
    config: mcp.Config,
    signal: AbortSignal
  ): Promise<MCPServer> {
    const server = new MCPServer(config, signal);
    await server.initializeClient();
    await server.notifyServer();

    await server.listTools();

    return server;
  }

  public get active(): boolean {
    return this.processActive;
  }

  private parseAndEmitMessages(): void {
    let newlineIndex;
    while ((newlineIndex = this.messageBuffer.indexOf('\n')) !== -1) {
      const message = this.messageBuffer.substring(0, newlineIndex).trim();
      this.messageBuffer = this.messageBuffer.substring(newlineIndex + 1);

      if (message) {
        try {
          const parsedMessage: unknown = JSON.parse(message);
          this.emit(INCOMING_MESSAGE_EVENT_ID, parsedMessage);
        } catch (e) {
          console.error(
            `Failed to parse MCP message: ${message}: ${JSON.stringify(e)}`
          );
        }
      }
    }
  }

  private async notifyServer(): Promise<void> {
    await this.makeRequest({
      decoder: z.any(),
      method: McpMethod.NOTIFY_INITIALIZED,
      listen: false,
    });
  }

  private async initializeClient(): Promise<void> {
    const response = await this.makeRequest({
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

    this.metadata = response.result;
  }

  public async callTool(name: string, args: object): Promise<unknown> {
    const data = await this.makeRequest({
      method: McpMethod.CALL_TOOL,
      decoder: toolCallResponseSchema,
      params: { name, arguments: args },
    });

    if (data.result.isError || !data.result.content) {
      throw new Error(`Failed to invoke tool`);
    }

    return data.result.content;
  }

  public async listTools(): Promise<mcp.Tool[]> {
    if (this.cachedTools.length > 0) {
      return this.cachedTools;
    }
    const { result } = await this.makeRequest({
      method: McpMethod.LIST_TOOLS,
      decoder: listToolsResponseSchema,
    });
    this.cachedTools = result.tools;

    return this.cachedTools;
  }

  private async makeRequest<T extends object, R>(props: {
    method: McpMethod;
    decoder: z.ZodType<R>;
    params?: T;
    listen?: boolean;
  }): Promise<R> {
    const { method, params, decoder, listen } = props;
    const id = messageIdRegistry[method];

    if (listen === false) {
      const payload = { jsonrpc: '2.0', id, method, params };
      this.process.stdin?.write(`${JSON.stringify(payload)}\n`);
      return undefined as R;
    }

    return await new Promise(resolve => {
      this.once(INCOMING_MESSAGE_EVENT_ID, (msg: JSONRPCSchema) => {
        if (msg.id !== id) return;

        const data = decoder.parse(msg);

        resolve(data);
      });
      const payload = { jsonrpc: '2.0', id, method, params };
      this.process.stdin?.write(`${JSON.stringify(payload)}\n`);
    });
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
