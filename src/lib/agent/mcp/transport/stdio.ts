import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Result } from '../../../result';
import type { JSONRPCSchema } from '../models';
import { type mcp } from '../types';
import {
  getMethodID,
  type IMCPTransport,
  type MCPTransportRequestProps,
  TransportEvent,
} from './common';

export class STDIOTransport implements IMCPTransport {
  public readonly controller: AbortController;

  private process: ChildProcess;
  private messageBuffer: string = '';
  private emitter: EventEmitter;

  constructor(
    public readonly name: string,
    private readonly config: mcp.Config,
    signal: AbortSignal
  ) {
    if (!this.config.command) {
      throw new Error('Cannot instantiate stdio transport without command');
    }

    this.emitter = new EventEmitter();
    this.controller = new AbortController();

    signal.addEventListener('abort', r => this.controller.abort(r));

    this.process = spawn(this.config.command, config.args, {
      shell: true,
      detached: true,
      signal: this.controller.signal,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        TERM: 'dumb',
        NO_COLOR: '1',
        CI: '1',
        ...(config.env ?? {}),
      },
    });
    if (!this.process.stdout) {
      throw new Error('Unable to spawn child process');
    }

    this.process.unref();
    this.process.stdout.on('data', (data: Buffer) => {
      this.messageBuffer += data.toString();
      this.parseAndEmitMessages();
    });

    this.process.on('close', () => {
      this.emitter.emit(TransportEvent.CLOSE);
    });
  }

  public on(event: TransportEvent, handler: () => any): STDIOTransport {
    this.emitter.on(event, handler);
    return this;
  }

  private parseAndEmitMessages(): void {
    let newlineIndex;
    while ((newlineIndex = this.messageBuffer.indexOf('\n')) !== -1) {
      const message = this.messageBuffer.substring(0, newlineIndex).trim();
      this.messageBuffer = this.messageBuffer.substring(newlineIndex + 1);

      if (message) {
        try {
          const parsedMessage: unknown = JSON.parse(message);
          this.emitter.emit(TransportEvent.MESSAGE, parsedMessage);
        } catch (e) {
          console.error(
            `Failed to parse MCP message: ${message}: ${JSON.stringify(e)}`
          );
        }
      }
    }
  }

  public async makeRequest<TParam, TRes>(
    props: MCPTransportRequestProps<TParam, TRes>
  ): Promise<Result<TRes, unknown>> {
    const { method, params, decoder } = props;
    const id = getMethodID(method);

    if (!decoder) {
      const payload = { jsonrpc: '2.0', id, method, params };
      this.process.stdin?.write(`${JSON.stringify(payload)}\n`);

      return Result.Ok(undefined as never);
    }

    return await new Promise(resolve => {
      this.emitter.once(TransportEvent.MESSAGE, (msg: JSONRPCSchema) => {
        if (msg.id !== id) return;

        const data = decoder.parse(msg);

        resolve(Result.Ok(data));
      });
      const payload = { jsonrpc: '2.0', id, method, params };
      this.process.stdin?.write(`${JSON.stringify(payload)}\n`);
    });
  }
}
