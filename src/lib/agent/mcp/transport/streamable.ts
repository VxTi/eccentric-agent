import { EventEmitter } from 'node:events';
import { Result } from '../../../result';
import { type mcp } from '../types';
import {
  type MCPTransportRequestProps,
  type IMCPTransport,
  TransportEvent,
} from './common';

export class HttpTransport implements IMCPTransport {
  public readonly controller: AbortController;

  private emitter: EventEmitter;

  constructor(
    public readonly name: string,
    private readonly config: mcp.Config,
    signal: AbortSignal
  ) {
    if (!this.config.httpUrl) {
      throw new Error('Unable to instantiate HTTP transport without URL');
    }
    this.controller = new AbortController();
    this.emitter = new EventEmitter();

    signal.addEventListener('abort', r => this.controller.abort(r));
  }

  public on(event: TransportEvent, handler: (...args: any[]) => any) {
    this.emitter.on(event, handler);
    return this;
  }

  public async makeRequest<TParam, TRes = undefined>(
    props: MCPTransportRequestProps<TParam, TRes>
  ): Promise<Result<TRes, unknown>> {
    const response = await fetch(this.config.httpUrl!, {
      method: 'POST',
      signal: this.controller.signal,
      headers: {
        ...(this.config.oauth?.enabled
          ? { Authorization: `Bearer ${this.config.oauth.clientSecret}` }
          : {}),
        'Mcp-Name': this.name,
        'Mcp-Method': props.method,
      },
    });

    if (!response.ok) {
      this.emitter.emit(TransportEvent.ERROR, response.statusText);

      return Result.Error(response.statusText);
    }

    const json: unknown = await response.json();
    if (json && typeof json === 'object' && 'error' in json) {
      this.emitter.emit(TransportEvent.ERROR, json);
      return Result.Error(json);
    }

    if (!props.decoder) {
      return Result.Ok(undefined as never); // no decoder = no return type expected
    }

    return Result.Ok(props.decoder.parse(json));
  }
}
