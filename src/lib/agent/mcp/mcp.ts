import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import {
  initializationResponseSchema,
  type JSONRPCSchema,
  listToolsResponseSchema,
  mcpConfigSchema,
  toolCallResponseSchema,
} from './models';
import { type mcp } from './types';

const enum McpMethod {
  INITIALIZE = 'initialize',
  NOTIFY_INITIALIZED = 'notifications/initialized',
  LIST_TOOLS = 'tools/list',
  CALL_TOOL = 'tools/call',
}

const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = {
  name: 'eccentric-agent',
  version: '1.0.0',
};

const messageIdRegistry: Partial<Record<McpMethod, number>> = {
  [McpMethod.INITIALIZE]: 1,
  [McpMethod.LIST_TOOLS]: 2,
  [McpMethod.CALL_TOOL]: 3,
};

const INCOMING_MESSAGE_EVENT_ID = 'incomingMessage';

export function getLocalClaudeConfig(): string {
  const home = os.homedir();
  switch (os.platform()) {
    case 'win32':
      return path.resolve(home, 'Claude/claude_desktop_config.json');
    case 'darwin':
      return path.resolve(
        home,
        'Library/Application Support/claude_desktop_config.json'
      );
    default:
      return path.resolve(home, '.config/Claude/claude_desktop_config.json');
  }
}

export async function loadMcpConfig(signal: AbortSignal): Promise<MCP[]> {
  const home = os.homedir();
  const cwd = process.cwd();

  const localPaths: string[] = [
    // getLocalClaudeConfig(),
    path.resolve(cwd, '.agents/mcp.json'),
    path.resolve(cwd, '.kiro/mcp.json'),
    path.resolve(home, '.kiro/mcp.json'),

    // path.resolve(cwd, '.claude.json'),
    // path.resolve(home, '.claude.json'),

    path.resolve(cwd, '.cursor/mcp.json'),
    path.resolve(home, '.cursor/mcp.json'),
  ];
  for (const path of localPaths) {
    if (!fs.existsSync(path)) {
      continue;
    }

    const content = await fs.promises.readFile(path, 'utf8');
    const json: unknown = JSON.parse(content);
    const parsed = mcpConfigSchema.parse(json);

    return Promise.all(
      Object.entries(parsed.mcpServers).map(
        async ([name, config]) => await MCP.createClient(name, config, signal)
      )
    );
  }

  return [];
}

export class MCP extends EventEmitter {
  private metadata: mcp.ServerInfo | undefined;
  private process: ChildProcess;
  private messageBuffer: string = '';
  private cachedTools: mcp.Tool[];
  private processActive: boolean;

  private constructor(
    public readonly name: string,
    config: mcp.McpConfig,
    signal: AbortSignal
  ) {
    super();
    this.cachedTools = [];
    this.processActive = true;
    this.process = spawn(config.command, config.args, {
      shell: true,
      detached: true,
      signal,
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

    /*this.process.stderr?.on('data', (data: Buffer) => {
      console.error(`-> (${this.name}): ${data.toString()}`);
    });*/

    this.process.on('close', () => (this.processActive = false));
  }

  private parseAndEmitMessages() {
    let newlineIndex;
    while ((newlineIndex = this.messageBuffer.indexOf('\n')) !== -1) {
      const message = this.messageBuffer.substring(0, newlineIndex).trim();
      this.messageBuffer = this.messageBuffer.substring(newlineIndex + 1);

      if (message) {
        try {
          const parsedMessage: unknown = JSON.parse(message);
          this.emit(INCOMING_MESSAGE_EVENT_ID, parsedMessage);
        } catch (e) {
          console.error(`Failed to parse MCP message: ${message}`, e);
        }
      }
    }
  }

  public get active() {
    return this.processActive;
  }

  static async createClient(
    name: string,
    config: mcp.McpConfig,
    signal: AbortSignal
  ): Promise<MCP> {
    const mcp = new MCP(name, config, signal);
    await mcp.initializeClient();
    await mcp.notifyServer();
    await mcp.listToolsInternal();

    return mcp;
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

  private async listToolsInternal(): Promise<void> {
    const { result } = await this.makeRequest({
      method: McpMethod.LIST_TOOLS,
      decoder: listToolsResponseSchema,
    });
    this.cachedTools = result.tools;
  }

  public get listTools(): mcp.Tool[] {
    return this.cachedTools;
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

  public get serverMetadata(): mcp.ServerInfo {
    if (!this.metadata) {
      throw new Error('MCP Server metadata not initialized');
    }

    return this.metadata;
  }
}
