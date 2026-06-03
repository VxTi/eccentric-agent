import { z } from 'zod';

const basicMcpConfig = z.object({
  args: z.optional(z.array(z.string())),
  autoApprove: z.optional(z.array(z.string())),
  env: z.optional(z.record(z.string(), z.string())),
  oauth: z.optional(
    z.object({
      enabled: z.boolean(),
      clientId: z.string(),
      clientSecret: z.string(),
      scopes: z.array(z.string()),
    })
  ),
});

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
  mcpServers: z.record(z.string(), mcpServerConfigSchema),
});

export const basicJsonRpcResponseSchema = z.object({
  jsonrpc: z.string(),
  id: z.number().optional(),
  result: z.any(),
});
export type JSONRPCSchema = z.infer<typeof basicJsonRpcResponseSchema>;
