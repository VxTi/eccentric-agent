import {
  Client,
  StdioClientTransport,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  auth,
  type Transport,
} from '@modelcontextprotocol/client';
import { LocalFileOAuthProvider } from './oauth-provider';
import first from 'lodash/first';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { requiredEnv } from '../../env';
import { acquireContextInstance } from '../../events/context-acquisition';
import type { PromiseResult } from '../../types/types';
import { mcpConfigSchema } from './models';
import { type mcp } from './types';
import { config } from 'dotenv';

config({ quiet: true });

export type McpTool = PromiseResult<
  ReturnType<(typeof MCP)['prototype']['client']['listTools']>
>['tools'][number];

const protocolVersion: string = '2025-11-25';

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

    return await Promise.all(
      Object.entries(parsed.mcpServers).map(
        async ([name, config]) => await MCP.create(name, config, signal)
      )
    );
  }

  return [];
}

export class MCP extends EventEmitter {
  constructor(
    public readonly config: mcp.Config,
    public readonly name: string,
    public readonly client: Client,
    public readonly transport: Transport
  ) {
    super();
  }

  static async create(
    name: string,
    config: mcp.Config,
    signal: AbortSignal
  ): Promise<MCP> {
    const { transport, client } = await this.makeTransport(name, config, signal);

    signal.addEventListener('abort', async () => {
      await transport.close();
      await client.close();
    });

    return new MCP(config, name, client, transport);
  }

  private static async makeTransport(
    name: string,
    config: mcp.Config,
    signal: AbortSignal
  ): Promise<{ client: Client; transport: Transport }> {
    if ('command' in config) {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        stderr: 'ignore',
      });
      const client = new Client({ name: 'eccentric-agent', version: '1.0.0' });
      await client.connect(transport, { signal });

      return { client, transport };
    }

    const authProvider = config.oauth?.enabled
      ? new LocalFileOAuthProvider(
          name,
          requiredEnv('GOOGLE_OAUTH_CLIENT_ID'),
          requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
          config.oauth.scopes
        )
      : undefined;

    const url = new URL(config.httpUrl);
    const transport = new StreamableHTTPClientTransport(url, {
      protocolVersion,
      authProvider,
    });
    const client = new Client({ name: 'eccentric-agent', version: '1.0.0' });

    try {
      await client.connect(transport, { signal });
    } catch (err) {
      if (!(err instanceof UnauthorizedError) || !authProvider) {
        throw err;
      }

      // Existing tokens missing or invalid — drive the authorization-code flow.
      // `auth()` calls provider.redirectToAuthorization, which opens the browser
      // and starts a local listener. We then wait for the code and exchange it.
      await auth(authProvider, { serverUrl: url });
      const code = await authProvider.waitForAuthorizationCode();
      await transport.finishAuth(code);

      // Reconnect with a fresh transport (the old one was aborted by the 401).
      const retryTransport = new StreamableHTTPClientTransport(url, {
        protocolVersion,
        authProvider,
      });
      await client.connect(retryTransport, { signal });
      return { client, transport: retryTransport };
    }

    return { client, transport };
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
