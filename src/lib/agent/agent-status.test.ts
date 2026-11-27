import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Agent } from './agent';
import { StatusFlag } from './agent-base';

vi.mock('./skills/discovery', () => ({
  discoverSkillFiles: vi.fn(),
}));

vi.mock('./system-prompt', () => ({
  constructSystemPrompt: vi.fn(() => Promise.resolve('test system prompt')),
  constructSkillStateReminder: vi.fn(() => null),
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
import { discoverSkillFiles } from './skills/discovery';
const streamTextMock = streamText as unknown as Mock;
const discoverSkillsMock = vi.mocked(discoverSkillFiles);

function createAgent(): Agent {
  return new Agent(new AbortController().signal, '/tmp/eccentric-test');
}

function fakeSuccessfulStream(): unknown {
  return {
    stream: (async function* emptyStream() {})(),
    steps: Promise.resolve([]),
    finalStep: Promise.resolve({ usage: {} }),
  };
}

afterEach(() => {
  streamTextMock.mockReset();
  discoverSkillsMock.mockReset();
});

describe('AgentBase.loadSkills', () => {
  it('sets the error flag without leaving the loading flag stuck', async () => {
    discoverSkillsMock.mockRejectedValue(new Error('skill discovery failed'));
    const agent = createAgent();

    const loaded = await agent.loadSkills();

    expect(loaded).toBe(false);
    expect(agent.status.has(StatusFlag.ERROR_LOADING_SKILLS)).toBe(true);
    expect(agent.status.has(StatusFlag.LOADING_SKILLS)).toBe(false);
  });
});

describe('Agent streaming status', () => {
  it('clears a previous streaming error when a new turn starts', async () => {
    streamTextMock.mockRejectedValueOnce(new Error('provider down'));
    streamTextMock.mockImplementationOnce(() => fakeSuccessfulStream());
    const agent = createAgent();

    await agent.submitMessage('first');
    expect(agent.status.has(StatusFlag.ERROR_STREAMING)).toBe(true);

    await agent.submitMessage('second');

    expect(agent.status.has(StatusFlag.ERROR_STREAMING)).toBe(false);
    expect(agent.status.has(StatusFlag.STREAMING)).toBe(false);
  });

  it('does not report an error when the turn is cancelled', async () => {
    streamTextMock.mockRejectedValueOnce(new Error('aborted'));
    const agent = createAgent();

    const turn = agent.submitMessage('hello');
    agent.cancel();
    await turn;

    expect(agent.status.has(StatusFlag.ERROR_STREAMING)).toBe(false);
    expect(agent.status.has(StatusFlag.STREAMING)).toBe(false);
  });

  it('reports an error when a turn fails without cancellation', async () => {
    streamTextMock.mockRejectedValueOnce(new Error('provider down'));
    const agent = createAgent();

    await agent.submitMessage('hello');

    expect(agent.status.has(StatusFlag.ERROR_STREAMING)).toBe(true);
    expect(agent.status.has(StatusFlag.STREAMING)).toBe(false);
  });
});
