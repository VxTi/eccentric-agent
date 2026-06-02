import {
  type initializationResponseSchema,
  type mcpServerConfigSchema,
  type promptSchema,
  type resourceSchema,
  type toolSchema,
} from './models';
import type { z } from 'zod';

export declare namespace mcp {
  type McpConfig = z.infer<typeof mcpServerConfigSchema>;

  type Prompt = z.infer<typeof promptSchema>;

  type Resource = z.infer<typeof resourceSchema>;

  type Tool = z.infer<typeof toolSchema>;

  type ServerInfo = z.infer<typeof initializationResponseSchema>['result'];

  type CommunicationProtocol = (
    data: object,
    protocolVersion?: string
  ) => Promise<unknown>;
}
