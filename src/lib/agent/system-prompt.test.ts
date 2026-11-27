import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SkillInclusion, type AgentSkill } from './skills/model';

vi.mock('../state', () => ({
  store: {
    getState: () => ({ agent: { messages: [] } }),
    dispatch: vi.fn(),
  },
  pushEntry: vi.fn(),
  setMessages: vi.fn(),
}));
import {
  constructSkillStateReminder,
  constructSystemPrompt,
} from './system-prompt';
import type { StatefulSkillMap } from './agent-base';

function makeSkill(input: {
  name: string;
  inclusion: SkillInclusion;
  content?: string;
}): AgentSkill {
  return {
    name: input.name,
    description: `Description of ${input.name}`,
    inclusion: input.inclusion,
    content: input.content ?? `Content of ${input.name}`,
    path: `/skills/${input.name}.md`,
  };
}

function makeSkillMap(...skills: (AgentSkill & { active?: boolean })[]) {
  return new Map(skills.map(skill => [skill.name, skill])) as StatefulSkillMap;
}

const alwaysSkill = makeSkill({
  name: 'always-skill',
  inclusion: SkillInclusion.ALWAYS,
});
const autoSkill = makeSkill({
  name: 'auto-skill',
  inclusion: SkillInclusion.AUTO,
});

describe('constructSystemPrompt', () => {
  it('embeds the full content of always-included skills', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'eccentric-prompt-'));

    const prompt = await constructSystemPrompt({
      mcpServers: new Set(),
      cwd,
      gitIgnore: new Set(),
      skills: makeSkillMap(alwaysSkill, autoSkill),
    });

    expect(prompt).toContain('Content of always-skill');
  });

  it('lists on-demand skills by name and description without their content', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'eccentric-prompt-'));

    const prompt = await constructSystemPrompt({
      mcpServers: new Set(),
      cwd,
      gitIgnore: new Set(),
      skills: makeSkillMap(alwaysSkill, autoSkill),
    });

    expect(prompt).toContain('auto-skill');
    expect(prompt).toContain('Description of auto-skill');
    expect(prompt).not.toContain('Content of auto-skill');
  });
});

describe('constructSkillStateReminder', () => {
  it('includes the name and content of an activated skill', () => {
    const reminder = constructSkillStateReminder({
      activated: [{ ...autoSkill, active: true }],
      deactivated: [],
    });

    expect(reminder).toContain('auto-skill');
    expect(reminder).toContain('Content of auto-skill');
  });

  it('names a deactivated skill without its content', () => {
    const reminder = constructSkillStateReminder({
      activated: [],
      deactivated: ['auto-skill'],
    });

    expect(reminder).toContain('`auto-skill` has been deactivated');
    expect(reminder).not.toContain('Content of auto-skill');
  });

  it('returns null when nothing changed', () => {
    expect(
      constructSkillStateReminder({ activated: [], deactivated: [] })
    ).toBeNull();
  });
});
