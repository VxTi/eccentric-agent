import { z } from 'zod';
import { requiredEnv } from '../../env';

const basicMcpConfig = z.object({
  args: z.optional(z.array(z.string())),
  autoApprove: z.optional(z.array(z.string())),
  env: z.optional(z.record(z.string(), z.string())),
  disabled: z.optional(z.boolean()),
  headers: z.optional(z.record(z.string(), z.string().transform(resolveEnv))),
  oauth: z.optional(
    z.object({
      enabled: z.boolean(),
      clientId: z.string().transform(resolveEnv),
      clientSecret: z.optional(z.string().transform(resolveEnv)),
      scopes: z.optional(z.array(z.string())),
    })
  ),
});

function resolveEnv(value: string): string {
  return value.replace(/\$(\w+)\b/, (_, secretId: string) =>
    requiredEnv(secretId)
  );
}

const commandConfig = z.object({
  ...basicMcpConfig.shape,
  command: z.string(),
});

const httpConfig = z.object({
  ...basicMcpConfig.shape,
  httpUrl: z.string(),
});

export const mcpServerConfigSchema = z.union([commandConfig, httpConfig]);

export const mcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), z.unknown()),
});

export const basicJsonRpcResponseSchema = z.object({
  jsonrpc: z.string(),
  id: z.number().optional(),
  result: z.any(),
});
export type JSONRPCSchema = z.infer<typeof basicJsonRpcResponseSchema>;
