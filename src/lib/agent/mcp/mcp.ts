import {
  Client,
  StdioClientTransport,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type Transport,
  createMiddleware,
  applyMiddlewares,
} from '@modelcontextprotocol/client';
import { type z } from 'zod';
import { debug, emitMessage } from '../../events/messaging';
import { LocalFileOAuthProvider } from './oauth-provider';
import first from 'lodash/first';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { acquireContextInstance } from '../../events/context-acquisition';
import type { PromiseResult } from '../../types/types';
import { mcpConfigSchema, mcpServerConfigSchema } from './models';
import { type mcp } from './types';
import { config } from 'dotenv';

config({ quiet: true });

export type McpTool = PromiseResult<
  ReturnType<(typeof MCP)['prototype']['client']['listTools']>
>['tools'][number];

const protocolVersion: string = '2025-11-25';

export async function loadMcpConfig(signal: AbortSignal): Promise<MCP[]> {
  const home = os.homedir();
  const cwd = process.cwd();

  const localPaths: string[] = [
    path.resolve(cwd, '.agents/mcp.json'),
    path.resolve(cwd, '.kiro/mcp.json'),
    path.resolve(home, '.kiro/mcp.json'),
    path.resolve(cwd, '.cursor/mcp.json'),
    path.resolve(home, '.cursor/mcp.json'),
  ];

  for (const path of localPaths) {
    if (!fs.existsSync(path)) {
      continue;
    }

    const content = await fs.promises.readFile(path, 'utf8');
    const json: unknown = JSON.parse(content);
    const parsed = mcpConfigSchema.safeParse(json);

    if (!parsed.success) {
      return Promise.reject(parsed.error);
    }

    const failed: string[] = [];
    const configs = Object.entries(parsed.data.mcpServers)
      .map(
        ([key, value]): [
          string,
          z.infer<typeof mcpServerConfigSchema> | undefined,
        ] => {
          const parsed = mcpServerConfigSchema.safeParse(value);
          if (!parsed.success) {
            failed.push(key);
            return [key, undefined];
          }

          return [key, parsed.data];
        }
      )
      .filter(
        (input): input is [string, z.infer<typeof mcpServerConfigSchema>] =>
          !input[1]?.disabled
      );

    if (failed.length > 0) {
      emitMessage({
        type: 'generic',
        failure: true,
        content: `Failed to initialize the following MCPs:\n${failed.map(f => `- ${f}`).join('\n')}`,
      });
    }

    return await Promise.all(
      configs.map(
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
    public readonly transport: Transport,
    public readonly authProvider?: LocalFileOAuthProvider
  ) {
    super();
  }

  /**
   * Wraps a request to the MCP server with OAuth retry-on-401 logic.
   *
   * Google's MCP servers respond 200 to the initial handshake even when
   * unauthenticated and only reject the actual JSON-RPC calls — meaning the
   * 401 happens here, not during `client.connect`. When it does, the SDK
   * triggers `redirectToAuthorization` (opens the browser, captures the code
   * in our provider) and then throws `UnauthorizedError`. We catch it,
   * complete the token exchange via `transport.finishAuth`, and retry once.
   */
  async withAuth<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      if (
        !(err instanceof UnauthorizedError) ||
        !this.authProvider ||
        !(this.transport instanceof StreamableHTTPClientTransport)
      ) {
        throw err;
      }

      const code = await this.authProvider.waitForAuthorizationCode();
      await this.transport.finishAuth(code);
      return await operation();
    }
  }

  static async create(
    name: string,
    config: mcp.Config,
    signal: AbortSignal
  ): Promise<MCP> {
    try {
      const { transport, client, authProvider } = await this.makeTransport(
        name,
        config,
        signal
      );

      signal.addEventListener('abort', async () => {
        await transport.close();
        await client.close();
      });

      return new MCP(config, name, client, transport, authProvider);
    } catch (err) {
      throw err;
    }
  }

  private static async makeStdioTransport(
    config: mcp.CommandConfig,
    signal: AbortSignal
  ) {
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

  private static async makeTransport(
    name: string,
    config: mcp.Config,
    signal: AbortSignal
  ): Promise<{
    client: Client;
    transport: Transport;
    authProvider?: LocalFileOAuthProvider;
  }> {
    if ('command' in config) {
      return await this.makeStdioTransport(config, signal);
    }

    const authProvider = resolveOAuthConfig(name, config);
    const url = new URL(config.httpUrl);
    const fetchMiddleware = createMiddleware(async (next, input, init) => {
      const headers = new Headers(init?.headers);
      Object.entries(config.headers ?? {}).forEach(([key, value]) =>
        headers.set(key, value)
      );
      return next(input, { ...init, headers });
    });
    const transport = new StreamableHTTPClientTransport(url, {
      protocolVersion,
      authProvider,
      fetch: applyMiddlewares(fetchMiddleware)(fetch),
    });
    const client = new Client({ name: 'eccentric-agent', version: '1.0.0' });
    try {
      await client.connect(transport, { signal });
    } catch (err) {
      if (!(err instanceof UnauthorizedError) || !authProvider) {
        throw err;
      }

      // The transport's 401 handler has already invoked
      // `authProvider.redirectToAuthorization` (via `adaptOAuthProvider` →
      // `handleOAuthUnauthorized` → `auth()`), so the browser is open and our
      // local listener is running. We only need to wait for the code, exchange
      // it for tokens, and reconnect.
      debug(`[MCP ${name}] waiting for OAuth callback...`);
      const code = await authProvider.waitForAuthorizationCode();
      debug(`[MCP ${name}] received OAuth code, exchanging for tokens...`);
      try {
        await transport.finishAuth(code);
      } catch (exchangeErr) {
        debug(
          `[MCP ${name}] token exchange failed:`,
          exchangeErr instanceof Error
            ? (exchangeErr.stack ?? exchangeErr.message)
            : exchangeErr
        );
        throw exchangeErr;
      }
      debug(`[MCP ${name}] tokens saved, reconnecting...`);

      // The original Client was closed when the initial handshake threw
      // (Client.connect catches the initialize error and calls close()), and
      // the transport's stream was aborted by the 401. Re-create both so the
      // retry starts from a clean state and picks up the freshly-saved tokens.
      const retryTransport = new StreamableHTTPClientTransport(url, {
        protocolVersion,
        authProvider,
      });
      const retryClient = new Client({
        name: 'eccentric-agent',
        version: '1.0.0',
      });
      await retryClient.connect(retryTransport, { signal });
      debug(`[MCP ${name}] authenticated and connected.`);
      return {
        client: retryClient,
        transport: retryTransport,
        authProvider,
      };
    }

    return { client, transport, authProvider };
  }
}

function resolveOAuthConfig(
  mcpName: string,
  config: mcp.Config
): LocalFileOAuthProvider | undefined {
  if (!config.oauth?.enabled) return undefined;

  const { clientId, clientSecret } = config.oauth;

  return new LocalFileOAuthProvider(
    mcpName,
    clientId,
    clientSecret,
    config.oauth.scopes ?? []
  );
}

export async function getMCPServer(name: string): Promise<MCP> {
  const context = await acquireContextInstance();

  const mcp = first(context.mcpServers.filter(server => server.name === name));

  if (!mcp) {
    throw new Error(`MCP "${name}" was not found`);
  }
  return mcp;
}
