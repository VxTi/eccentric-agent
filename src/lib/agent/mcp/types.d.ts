import { type mcpServerConfigSchema } from './models';
import type { z } from 'zod';

export declare namespace mcp {
  type Config = z.infer<typeof mcpServerConfigSchema>;
}
