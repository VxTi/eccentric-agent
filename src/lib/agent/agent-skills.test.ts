import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Agent } from './agent';
import { AgentEvents } from './agent-base';
import { SkillInclusion, type AgentSkill } from './skills/model';

vi.mock('./skills/discovery', () => ({
  discoverSkillFiles: vi.fn(),
}));

let promptCounter = 0;
vi.mock('./system-prompt', () => ({
  constructSystemPrompt: vi.fn(() =>
    Promise.resolve(`system prompt #${++promptCounter}`)
  ),
  constructStateReminderMessage: vi.fn(() => null),
}));

vi.mock('../state', () => ({
  store: {
    getState: () => ({ agent: { messages: [] } }),
    dispatch: vi.fn(),
  },
  pushEntry: vi.fn(),
  setMessages: vi.fn(),
}));

vi.mock('ai', async importOriginal => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText: vi.fn() };
});

import { streamText } from 'ai';
const streamTextMock = streamText as unknown as Mock;

function createAgent(): Agent {
  return new Agent(new AbortController().signal, '/tmp/eccentric-test');
}

function makeSkill(input: {
  name: string;
  inclusion: SkillInclusion;
}): AgentSkill {
  return {
    name: input.name,
    description: `Description of ${input.name}`,
    inclusion: input.inclusion,
    content: `Content of ${input.name}`,
    path: `/skills/${input.name}.md`,
  };
}

function fakeSuccessfulStream(): unknown {
  return {
    stream: (async function* emptyStream() {})(),
    steps: Promise.resolve([]),
    finalStep: Promise.resolve({ usage: {} }),
  };
}

function systemPromptOfCall(callIndex: number): string {
  const [request] = streamTextMock.mock.calls[callIndex] as [
    { messages: { role: string; content: string }[] },
  ];
  return request.messages[0]?.content ?? '';
}

afterEach(() => {
  streamTextMock.mockReset();
  promptCounter = 0;
});

describe('AgentBase.loadSkill', () => {
  it('seeds always-included skills as active and on-demand skills as inactive', () => {
    const agent = createAgent();
    agent.loadSkill(
      makeSkill({ name: 'builtin', inclusion: SkillInclusion.ALWAYS })
    );
    agent.loadSkill(
      makeSkill({ name: 'ondemand', inclusion: SkillInclusion.AUTO })
    );

    expect(agent.findSkill('builtin')?.active).toBe(true);
    expect(agent.findSkill('ondemand')?.active).toBe(false);
  });
});

describe('AgentBase.activateSkill', () => {
  it('marks the stored skill active and emits skill-activated', () => {
    const agent = createAgent();
    agent.loadSkill(makeSkill({ name: 'tdd', inclusion: SkillInclusion.AUTO }));
    const events: string[] = [];
    agent.on(AgentEvents.SKILL_ACTIVATED, skill => events.push(skill.name));

    agent.activateSkill('tdd');

    expect(agent.findSkill('tdd')?.active).toBe(true);
    expect(events).toEqual(['tdd']);
  });

  it('throws for a skill that was never loaded', () => {
    const agent = createAgent();

    expect(() => agent.activateSkill('missing')).toThrow('missing');
  });
});

describe('AgentBase.deactivateSkill', () => {
  it('marks the stored skill inactive and emits skill-deactivated', () => {
    const agent = createAgent();
    agent.loadSkill(makeSkill({ name: 'tdd', inclusion: SkillInclusion.AUTO }));
    agent.activateSkill('tdd');
    const events: string[] = [];
    agent.on(AgentEvents.SKILL_DEACTIVATED, skill => events.push(skill.name));

    agent.deactivateSkill('tdd');

    expect(agent.findSkill('tdd')?.active).toBe(false);
    expect(events).toEqual(['tdd']);
  });

  it('deactivates an always-included skill until it is reloaded', () => {
    const agent = createAgent();
    agent.loadSkill(
      makeSkill({ name: 'builtin', inclusion: SkillInclusion.ALWAYS })
    );

    agent.deactivateSkill('builtin');

    expect(agent.findSkill('builtin')?.active).toBe(false);
  });

  it('throws for a skill that was never loaded', () => {
    const agent = createAgent();

    expect(() => agent.deactivateSkill('missing')).toThrow('missing');
  });
});

describe('Agent system prompt invalidation', () => {
  it('rebuilds the system prompt when a skill is loaded after the first turn', async () => {
    streamTextMock.mockImplementation(() => fakeSuccessfulStream());
    const agent = createAgent();
    agent.loadSkill(
      makeSkill({ name: 'first', inclusion: SkillInclusion.AUTO })
    );

    await agent.submitMessage('first turn');
    agent.loadSkill(
      makeSkill({ name: 'second', inclusion: SkillInclusion.AUTO })
    );
    await agent.submitMessage('second turn');

    expect(systemPromptOfCall(0)).toBe('system prompt #1');
    expect(systemPromptOfCall(1)).toBe('system prompt #2');
  });

  it('keeps the cached system prompt when no skill state changes between turns', async () => {
    streamTextMock.mockImplementation(() => fakeSuccessfulStream());
    const agent = createAgent();

    await agent.submitMessage('first turn');
    await agent.submitMessage('second turn');

    expect(systemPromptOfCall(0)).toBe('system prompt #1');
    expect(systemPromptOfCall(1)).toBe('system prompt #1');
  });
});
