import type {
  McpServerCommandConfig,
  mcpServerConfigSchema,
  McpServerHttpConfig,
} from './models';
import type { z } from 'zod';

export declare namespace mcp {
  type Config = z.infer<typeof mcpServerConfigSchema>;

  type CommandConfig = McpServerCommandConfig;
  type HttpConfig = McpServerHttpConfig;
}
