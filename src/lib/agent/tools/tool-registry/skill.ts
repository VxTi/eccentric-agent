import { isNil, isNotNil, type Nullable } from '@vxti/typed';
import type { ModelMessage, ToolModelMessage, ToolResultPart } from 'ai';
import * as z from 'zod';
import { Result } from '../../../result';
import { store } from '../../../state';
import type { SkillName } from '../../skills/model';
import { createTool } from '../tool-definition';

const USE_SKILL_TOOL = 'use_skill';

const inputSchema = z.object({
  skill: z.string(),
});

export const useSkill = createTool({
  internalName: USE_SKILL_TOOL,
  name: 'Use a skill',
  description: `
    Use a skill to perform a task. Accepts a single argument of which tool to invoke.
    Returns the skill's instructions, which apply from then on.
  `,
  inputSchema,
  outputSchema: z.object({ skill: z.string(), content: z.string() }),

  handle({ skill }) {
    const { agent } = store.getState().agent;

    const skillItem = agent.findSkill(skill);
    if (isNil(skillItem)) {
      return Result.Error(`Skill \`${skill}\` not found`, { skill });
    }

    agent.activateSkill(skillItem.name);

    return Result.Ok(
      { skill: skillItem.name, content: skillItem.content },
      { skill }
    );
  },

  inputToString: ({ skill }) => `Activating skill \`${skill}\``,
  outputToString: (_, __, { skill }) => `Using skill \`${skill}\``,
});

/** Skills whose body was delivered by a successful `use_skill` result. */
export function getActivatedSkillsFromMessages(
  messages: readonly ModelMessage[]
): SkillName[] {
  return messages
    .filter((message): message is ToolModelMessage => message.role === 'tool')
    .flatMap(message => message.content)
    .filter(
      (part): part is ToolResultPart =>
        part.type === 'tool-result' && part.toolName === USE_SKILL_TOOL
    )
    .map(getActivatedSkillFromToolPart)
    .filter((skill): skill is SkillName => isNotNil(skill));
}

const activatedSkillSchema = z.looseObject({
  data: z.looseObject({
    skill: z.string<SkillName>(),
  }),
});

function getActivatedSkillFromToolPart(
  part: ToolResultPart
): Nullable<SkillName> {
  if (part.output.type !== 'json') return undefined;

  const result = activatedSkillSchema.safeParse(part.output.value);

  return result.data?.data.skill;
}
