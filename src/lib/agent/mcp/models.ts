import { z } from 'zod';

export const mcpServerConfigSchema = z.object({
  command: z.optional(z.string()),
  httpUrl: z.optional(z.string()),
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

export const mcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), mcpServerConfigSchema),
});

export const basicJsonRpcResponseSchema = z.object({
  jsonrpc: z.string(),
  id: z.number().optional(),
  result: z.any(),
});
export type JSONRPCSchema = z.infer<typeof basicJsonRpcResponseSchema>;

export const jsonRpcResponseSchema = <T>(result: z.ZodType<T>) =>
  z.object({
    ...basicJsonRpcResponseSchema.shape,
    result,
  });

export const basicJsonRpcMessageSchema = jsonRpcResponseSchema(z.object({}));

export const serverInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  title: z.optional(z.string()),
  description: z.optional(z.string()),
  icons: z.optional(
    z.array(
      z.object({
        src: z.string(),
        mimeType: z.string(),
        sizes: z.array(z.string()),
      })
    )
  ),
  websiteUrl: z.optional(z.string()),
});

export const initializationResponseSchema = jsonRpcResponseSchema(
  z.object({
    protocolVersion: z.string(),
    capabilities: z.object({
      tools: z.optional(
        z.object({
          listChanged: z.boolean(),
        })
      ),
      resources: z.record(z.string(), z.string()),
    }),
    serverInfo: serverInfoSchema,
  })
);

export const primitiveSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const toolSchema = z.object({
  ...primitiveSchema.shape,
  inputSchema: z.unknown(),
});
export const listToolsResponseSchema = jsonRpcResponseSchema(
  z.object({
    tools: z.array(toolSchema),
  })
);

export const toolCallResponseSchema = jsonRpcResponseSchema(
  z.object({
    content: z.optional(
      z.array(
        z.object({
          type: z.literal('text'),
          text: z.string(),
        })
      )
    ),
    isError: z.boolean(),
  })
);

export const resourceSchema = z.object({
  ...primitiveSchema.shape,
  content: z.any(),
});

export const promptSchema = z.object({
  ...primitiveSchema.shape,
  template: z.string(),
});
