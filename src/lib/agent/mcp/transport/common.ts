import { type z } from 'zod';
import { type Result } from '../../../result';

export const enum McpMethod {
  INITIALIZE = 'initialize',
  NOTIFY_INITIALIZED = 'notifications/initialized',
  LIST_TOOLS = 'tools/list',
  CALL_TOOL = 'tools/call',
}

export function getMethodID(method: McpMethod): number | undefined {
  switch (method) {
    case McpMethod.INITIALIZE:
      return 1;
    case McpMethod.LIST_TOOLS:
      return 2;
    case McpMethod.CALL_TOOL:
      return 3;
    default:
      return undefined;
  }
}

export const enum TransportEvent {
  CLOSE = 'close',
  MESSAGE = 'message',
  ERROR = 'error',
}

export interface MCPTransportRequestProps<TParams, TResponse = never> {
  method: McpMethod;
  decoder?: z.ZodType<TResponse>;
  params?: TParams;
}

export interface IMCPTransport {
  readonly name: string;
  readonly controller: AbortController;

  on(event: TransportEvent, handler: (...args: any[]) => any): any;

  makeRequest<TParam, TRes>(
    props: MCPTransportRequestProps<TParam, TRes>
  ): Promise<Result<TRes, unknown>>;
}
