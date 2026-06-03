import {
  type OAuthClientInformation,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthTokens,
} from '@modelcontextprotocol/client';
import { spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import path from 'node:path';
import { debug } from '../../events/messaging';
import { StatusCode } from '../../types/status-codes';

const CALLBACK_PORT = 3006;
const CALLBACK_PATH = '/callback';
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;

function tokensDir(): string {
  return path.resolve(os.homedir(), '.eccentric-agent/mcp-tokens');
}

function openBrowserCommand(platform: NodeJS.Platform): string {
  switch (platform) {
    case 'win32':
      return 'start';
    case 'darwin':
      return 'open';
    default:
      return 'xdg-open';
  }
}

function openBrowser(url: string): void {
  const child = spawn(openBrowserCommand(os.platform()), [url], {
    detached: true,
    stdio: 'ignore',
    shell: os.platform() === 'win32',
  });
  child.unref();
}

export class LocalFileOAuthProvider implements OAuthClientProvider {
  private _codeVerifier?: string;
  private _codePromise?: Promise<string>;

  constructor(
    private readonly serverName: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly scopes: readonly string[]
  ) {}

  get redirectUrl(): string {
    return CALLBACK_URL;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'eccentric-agent',
      redirect_uris: [CALLBACK_URL],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      scope: this.scopes.join(' '),
    };
  }

  public clientInformation(): OAuthClientInformation {
    return { client_id: this.clientId, client_secret: this.clientSecret };
  }

  private get tokenPath(): string {
    return path.resolve(tokensDir(), `${this.serverName}.json`);
  }

  public async tokens(): Promise<OAuthTokens | undefined> {
    return await fs.promises
      .readFile(this.tokenPath, 'utf8')
      .then(content => JSON.parse(content) as OAuthTokens)
      .catch(() => undefined);
  }

  public async saveTokens(tokens: OAuthTokens): Promise<void> {
    await fs.promises.mkdir(tokensDir(), { recursive: true });
    await fs.promises.writeFile(
      this.tokenPath,
      JSON.stringify(tokens, null, 2),
      { mode: 0o600 }
    );
  }

  public async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'
  ): Promise<void> {
    if (scope === 'all' || scope === 'tokens') {
      await fs.promises.unlink(this.tokenPath).catch(() => {});
    }
    if (scope === 'all' || scope === 'verifier') {
      this._codeVerifier = undefined;
    }
  }

  public saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier;
  }

  public codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error('PKCE code verifier not set');
    }
    return this._codeVerifier;
  }

  public state(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  public redirectToAuthorization(authorizationUrl: URL): void {
    // Google needs access_type=offline + prompt=consent to issue a refresh_token.
    authorizationUrl.searchParams.set('access_type', 'offline');
    authorizationUrl.searchParams.set('prompt', 'consent');

    this._codePromise = this.listenForCode();

    debug(
      `\n[MCP ${this.serverName}] Opening browser for authorization. If it does not open, visit:\n${authorizationUrl.toString()}\n`
    );
    openBrowser(authorizationUrl.toString());
  }

  waitForAuthorizationCode(): Promise<string> {
    if (!this._codePromise) {
      throw new Error(
        'redirectToAuthorization was not called before waitForAuthorizationCode'
      );
    }
    return this._codePromise;
  }

  private listenForCode(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (!req.url) return;
        const reqUrl = new URL(req.url, CALLBACK_URL);
        if (reqUrl.pathname !== CALLBACK_PATH) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');

        res.statusCode = StatusCode.OK;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (code) {
          res.end(
            `<html><head><script>window.addEventListener('DOMContentLoaded', () => window.close())</script></head><body><h2>Authorization complete</h2><p>You can close this tab and return to the terminal.</p></body></html>`
          );
          server.close();
          resolve(code);
        } else {
          res.end(
            `<html><body><h2>Authorization failed</h2><pre>${error ?? 'no code returned'}</pre></body></html>`
          );
          server.close();
          reject(
            new Error(`OAuth authorization failed: ${error ?? 'no code'}`)
          );
        }
      });

      server.on('error', reject);
      server.listen(CALLBACK_PORT, 'localhost');
    });
  }
}
