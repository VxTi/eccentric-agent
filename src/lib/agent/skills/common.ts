import * as z from 'zod';

/**
 * See  [Specification](https://agentskills.io/specification)
 */
export const FrontMatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z-]*[a-z0-9]$/, {
      error:
        'Skill name must start and end with a letter or number and can only contain letters, numbers, and hyphens.',
    }),
  description: z.string().min(1).max(1024),
  license: z.optional(z.string()),
  compatibility: z.optional(z.string().min(1).max(500)),
  metadata: z.optional(z.record(z.string(), z.string())),
});

export type SkillName = string & {};

export type AgentSkill = z.infer<typeof FrontMatterSchema> & {
  name: SkillName;
  content: string;
  path: string;
};
