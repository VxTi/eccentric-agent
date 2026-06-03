import { Client } from '@modelcontextprotocol/client';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { mcpConfigSchema } from './models';
import { MCPServer } from './server';
import { type mcp } from './types';

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

    return Object.entries(parsed.mcpServers).map(
      ([name, config]) => new MCP(name, config, signal)
    );
  }

  return [];
}

export class MCP extends EventEmitter {
  private mcpClient: Client;
  private server: MCPServer | undefined;

  constructor(
    public readonly name: string,
    public readonly config: mcp.Config,
    private readonly signal: AbortSignal
  ) {
    super();
    this.mcpClient = new Client({ name: 'eccentric-agent', version: '1.0.0' });
  }

  private async initialize(): Promise<void> {
    this.server = await MCPServer.create(this.config, this.signal);
  }

  public get active(): boolean {
    return !!this.server;
  }

  public async callTool(name: string, args: object): Promise<unknown> {
    if (!this.active) {
      await this.initialize();
    }
    return this.server!.callTool(name, args);
  }

  public async listTools(): Promise<mcp.Tool[]> {
    if (!this.active) {
      await this.initialize();
    }

    return this.server?.listTools() ?? [];
  }

  public async getServerMetadata(): Promise<mcp.ServerInfo> {
    if (!this.server?.metadata) {
      await this.initialize();
    }

    if (!this.server?.metadata) {
      throw new Error('Unable to retrieve server metadata');
    }
    return this.server.metadata;
  }
}
