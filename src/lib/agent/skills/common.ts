import * as z from 'zod';

/**
 * See  [Specification](https://agentskills.io/specification)
 */
export const FrontMatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  license: z.optional(z.string()),
  compatibility: z.optional(z.string()),
  metadata: z.optional(z.record(z.string(), z.string())),
});

export type AgentSkill = z.infer<typeof FrontMatterSchema> & {
  content: string;
  path: string;
};
