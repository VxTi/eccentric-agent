import { isNil } from '@vxti/typed';
import * as z from 'zod';
import { Result } from '../../../result';
import { store } from '../../../state';
import { createTool } from '../tool-definition';

const inputSchema = z.object({
  skill: z.string(),
});

export const useSkill = createTool({
  internalName: 'use_skill',
  name: 'Use a skill',
  description: `
    Use a skill to perform a task. Accepts a single argument of which tool to invoke.
  `,
  inputSchema,
  outputSchema: z.object({}),

  handle({ skill }) {
    const { agent } = store.getState().agent;

    const skillItem = agent.findSkill(skill);
    if (isNil(skillItem)) {
      return Result.Error(`Skill \`${skill}\` not found`, { skill });
    }

    agent.activateSkill(skillItem.name);

    return Result.Ok({}, { skill });
  },

  inputToString: ({ skill }) => `Activating skill \`${skill}\``,
  outputToString: (_, __, { skill }) => `Using skill \`${skill}\``,
});
