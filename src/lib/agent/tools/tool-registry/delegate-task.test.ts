// Enter through the store first: delegate-task -> tools/registry -> Agent ->
// state/index forms a cycle, and the store must be the module that kicks off
// that evaluation (as the app does), otherwise the registry sees a half-built
// delegate_task. Mirrors the note in state/agent-slice.test.ts.
import '../../../state/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Result } from '../../../result';
import { TaskComplexity } from '../../inference';

// Control SubAgent from the test: record each construction and hand back a
// resolver so a test decides when (and whether) an agent succeeds. Mocking it
// also keeps the real inference/model chain out of these tests.
const mock = vi.hoisted(() => ({
  calls: [] as { name: string; complexity: TaskComplexity | undefined }[],
  resolvers: new Map<string, (result: unknown) => void>(),
}));

vi.mock('../../sub-agent', () => ({
  SubAgent: class {
    constructor(options: {
      summary: string;
      goal: string;
      complexity: TaskComplexity | undefined;
      callback: (result: unknown) => void;
    }) {
      mock.calls.push({
        name: options.summary,
        complexity: options.complexity,
      });
      void new Promise<unknown>(resolve => {
        mock.resolvers.set(options.summary, resolve);
      }).then(options.callback);
    }
  },
}));

import { delegateTask } from './delegate-task';

type Task = {
  name: string;
  goal: string;
  dependsOn?: string[];
  complexity?: TaskComplexity;
};
type HandleResult = Awaited<ReturnType<typeof delegateTask.handle>>;

const channel = {
  notify: () => {},
  addInterceptor: () => {},
} as unknown as Parameters<typeof delegateTask.handle>[1];

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function run(tasks: Task[]): Promise<HandleResult> {
  return Promise.resolve(
    delegateTask.handle({ tasks }, channel, new AbortController().signal)
  );
}

function complete(name: string, ok = true): void {
  const resolve = mock.resolvers.get(name);
  if (!resolve) throw new Error(`no agent was started for "${name}"`);
  resolve(
    ok ? Result.Ok(`done:${name}`) : Result.Error(new Error(`fail:${name}`))
  );
}

function started(): string[] {
  return mock.calls.map(call => call.name);
}

function resultsOf(result: HandleResult): {
  taskName: string;
  taskResult: string;
  success: boolean;
}[] {
  if (!result.ok) throw new Error('expected a successful handle result');
  return result.data.data.results;
}

beforeEach(() => {
  mock.calls.length = 0;
  mock.resolvers.clear();
});

describe('delegate_task scheduler', () => {
  it('runs independent tasks in a single concurrent wave', async () => {
    const pending = run([
      { name: 'a', goal: 'ga' },
      { name: 'b', goal: 'gb' },
    ]);
    await tick();

    // Both agents are constructed before either has completed.
    expect(new Set(started())).toEqual(new Set(['a', 'b']));

    complete('a');
    complete('b');
    const result = await pending;

    expect(resultsOf(result).map(r => r.success)).toEqual([true, true]);
  });

  it('starts a dependent task only after its dependency succeeds', async () => {
    const pending = run([
      { name: 'a', goal: 'ga' },
      { name: 'b', goal: 'gb', dependsOn: ['a'] },
    ]);
    await tick();

    // Wave 1 is just 'a'; 'b' is held back by its dependency.
    expect(started()).toEqual(['a']);

    complete('a');
    await tick();
    expect(started()).toEqual(['a', 'b']);

    complete('b');
    const result = await pending;
    expect(resultsOf(result)).toEqual([
      { taskName: 'a', success: true, taskResult: 'done:a' },
      { taskName: 'b', success: true, taskResult: 'done:b' },
    ]);
  });

  it('skips a task whose dependency failed without running it', async () => {
    const pending = run([
      { name: 'a', goal: 'ga' },
      { name: 'b', goal: 'gb', dependsOn: ['a'] },
    ]);
    await tick();

    complete('a', false);
    const result = await pending;

    // 'b' was never constructed, and is reported as a skip.
    expect(started()).toEqual(['a']);
    const b = resultsOf(result).find(r => r.taskName === 'b');
    expect(b?.success).toBe(false);
    expect(b?.taskResult).toMatch(/depend/i);
  });

  it('cascades a skip through a chain of dependents', async () => {
    const pending = run([
      { name: 'a', goal: 'ga' },
      { name: 'b', goal: 'gb', dependsOn: ['a'] },
      { name: 'c', goal: 'gc', dependsOn: ['b'] },
    ]);
    await tick();

    complete('a', false);
    const result = await pending;

    expect(started()).toEqual(['a']);
    expect(resultsOf(result).map(r => r.success)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('fails a dependency cycle instead of hanging', async () => {
    const result = await run([
      { name: 'a', goal: 'ga', dependsOn: ['b'] },
      { name: 'b', goal: 'gb', dependsOn: ['a'] },
    ]);

    // Nothing runs; both are failed with a cycle message.
    expect(mock.calls).toHaveLength(0);
    const results = resultsOf(result);
    expect(results.map(r => r.success)).toEqual([false, false]);
    expect(results.every(r => /cyclic|unresolved/i.test(r.taskResult))).toBe(
      true
    );
  });

  it('ignores an unknown dependency name rather than deadlocking', async () => {
    const pending = run([
      { name: 'a', goal: 'ga', dependsOn: ['does-not-exist'] },
    ]);
    await tick();

    expect(started()).toEqual(['a']);
    complete('a');
    const result = await pending;
    expect(resultsOf(result)[0]?.success).toBe(true);
  });

  it('returns results in input order regardless of completion order', async () => {
    const pending = run([
      { name: 'a', goal: 'ga' },
      { name: 'b', goal: 'gb' },
      { name: 'c', goal: 'gc' },
    ]);
    await tick();

    complete('c');
    complete('a');
    complete('b');
    const result = await pending;

    expect(resultsOf(result).map(r => r.taskName)).toEqual(['a', 'b', 'c']);
  });

  it("passes each task's complexity through to its agent", async () => {
    const pending = run([
      { name: 'a', goal: 'ga', complexity: TaskComplexity.SIMPLE },
    ]);
    await tick();

    expect(mock.calls[0]?.complexity).toBe(TaskComplexity.SIMPLE);
    complete('a');
    await pending;
  });
});
