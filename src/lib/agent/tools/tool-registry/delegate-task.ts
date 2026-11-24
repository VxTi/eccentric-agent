import { isEmptyArray, isNotNil } from '@vxti/typed';
import * as z from 'zod';
import { Result } from '../../../result';
import { TaskComplexity } from '../../inference';
import { SubAgent } from '../../sub-agent';
import { type NotifierChannel } from '../../../events/notifier';
import {
  createTool,
  type SomeTool,
  type ToolChannelParams,
} from '../tool-definition';
import {
  createFile,
  findFile,
  findInFile,
  grep,
  readFile,
  replaceInFile,
} from './file-system';
import { callMcpTool, discoverMcpTool, listMcpTools } from './mcp';
import { shell } from './shell';
import { useSkill } from './skill';
import { createTaskList, updateTaskList } from './tasks';
import { webFetch } from './web-fetch';
import { webSearch } from './web-search';

const taskAgentTools: SomeTool[] = [
  findFile,
  findInFile,
  readFile,
  webSearch,
  webFetch,
  createTaskList,
  updateTaskList,
  discoverMcpTool,
  listMcpTools,
  callMcpTool,
  useSkill,
  shell,
  replaceInFile,
  createFile,
  grep,
] as const;

const taskSpecSchema = z.object({
  name: z
    .string()
    .describe(
      'A short, unique label for this task (e.g. `Some research task`,' +
        ' `Looking for this and that`). Used to identify its result and to let other tasks' +
        ' declare a dependency on it, so it must be unique within the batch.'
    ),
  goal: z
    .string()
    .describe(
      'The complete, self-contained instruction for this task. The task agent has NO access to your' +
        ' conversation history, so include every piece of context, constraint, and success criterion it' +
        ' needs. State explicitly what the final result should contain and which files or commands are' +
        ' involved.'
    ),
  dependsOn: z
    .array(z.string())
    .optional()
    .describe(
      'Names of other tasks in this batch that must finish successfully before this one starts.' +
        ' Declare a dependency ONLY when this task reads or builds on another task’s file edits, or' +
        ' would otherwise touch the same files concurrently. Tasks with no dependency between them run' +
        ' in parallel, so leaving this empty asserts the task is independent of every other unlisted task.' +
        ' If any dependency fails, this task is skipped.'
    ),
  complexity: z
    .enum(TaskComplexity)
    .optional()
    .describe(
      'How demanding this task is, used to pick the cheapest capable model:' +
        ' `simple` for trivial lookups or single-file edits, `medium` (the default) for ordinary' +
        ' multi-file work, `complex` only for genuinely hard, multi-step reasoning. Prefer the' +
        ' lowest tier that will get the job done.'
    ),
});

const inputSchema = z.object({
  tasks: z
    .array(taskSpecSchema)
    .describe(
      'A list of small, self-contained tasks to carry out. Each task is handled by its own capable' +
        ' agent that can read, search, write files and run shell commands. Independent tasks run' +
        ' concurrently; use `dependsOn` to order tasks that share files or build on each other’s' +
        ' edits. Keep each task tight and route it to the cheapest `complexity` tier that suffices.'
    ),
});

const taskResultSchema = z.object({
  taskName: z.string(),
  taskResult: z.string(),
  success: z.boolean(),
});
type TaskResult = z.infer<typeof taskResultSchema>;

const outputSchema = z.object({
  results: z.array(taskResultSchema),
});

interface TaskAgentRun {
  summary: string;
  goal: string;
  channel: NotifierChannel<ToolChannelParams>;
  signal: AbortSignal;
  complexity: TaskComplexity | undefined;
}

async function runTaskAgent({
  summary,
  goal,
  channel,
  signal,
  complexity,
}: TaskAgentRun): Promise<Result<string, Error>> {
  return new Promise(resolve => {
    const controller = new AbortController();

    signal.addEventListener('abort', () => controller.abort());

    new SubAgent({
      goal,
      summary,
      callback: resolve,
      signal: controller.signal,
      channel,
      tools: taskAgentTools,
      complexity,
    });
  });
}

type TaskStatus = 'pending' | 'success' | 'failed';
type TaskSpec = z.infer<typeof taskSpecSchema>;

/**
 * Resolves each task's `dependsOn` names to indices into `tasks`. Names that
 * match no task, and self-references, are dropped: an unresolved name must not
 * deadlock the batch, and the scheduler's cycle guard catches real cycles.
 */
function resolveDependencies(tasks: TaskSpec[]): number[][] {
  const indicesByName = new Map<string, number[]>();
  tasks.forEach((task, index) => {
    const existing = indicesByName.get(task.name) ?? [];
    existing.push(index);
    indicesByName.set(task.name, existing);
  });

  return tasks.map((task, index) => {
    const resolved = (task.dependsOn ?? [])
      .flatMap(name => indicesByName.get(name) ?? [])
      .filter(dep => dep !== index);
    return Array.from(new Set(resolved));
  });
}

export const delegateTask = createTool({
  internalName: 'delegate_task',
  name: 'Delegate Task',
  description:
    'Delegates concrete, self-contained units of work — above all any work that WRITES — to sub-agents' +
    ' that can read, search, edit files and run shell commands. THIS IS THE DEFAULT TOOL FOR ALL' +
    ' WRITE AND EXECUTE WORK: whenever a request involves editing, creating, or verifying files, or' +
    ' running commands, dispatch it here as one or more separate tasks instead of doing it in your' +
    ' own loop. Reach for it proactively, not as a last resort — even for a single edit, a one-file' +
    ' rename, or a lone command run. Typical jobs: refactors spanning several files, adding a feature' +
    ' across layers, renaming a symbol and updating its callers, scaffolding a module and wiring it' +
    ' into an index, migrating a set of call sites, or running a build or test suite and repairing' +
    ' what it reports. Boundary with the other tools: for purely read-only work that stays cheap' +
    ' (a few lookups, summarizing, comparing, auditing), search and read inline with `grep`,' +
    ' `find_in_file`, or `read_file` instead — those are cheaper than a sub-agent; but if the' +
    ' read-only work would require running commands or consuming many file reads, delegate it after' +
    ' all. Use `create_task_list` only to PLAN large ordered work for yourself — it executes nothing;' +
    ' execution always happens here. Each task agent receives ONLY the goal you provide, with no' +
    ' access to your conversation history, so make every goal fully self-contained: exact file paths,' +
    ' constraints, and the shape of the expected result. Keep each task small enough for one agent to' +
    ' finish — a batch of three tight tasks beats one vague task. Independent tasks run CONCURRENTLY' +
    ' to save time and tokens; when one task builds on another’s edits or would touch the same files,' +
    ' chain them with `dependsOn` so they run in order.',
  inputSchema,
  outputSchema,

  async handle({ tasks }, channel, signal) {
    const deps = resolveDependencies(tasks);
    const status: TaskStatus[] = tasks.map(() => 'pending');
    const results: (TaskResult | undefined)[] = tasks.map(() => undefined);

    const recordStateChange = (
      index: number,
      name: string,
      success: boolean,
      taskResult: string
    ) => {
      status[index] = success ? 'success' : 'failed';
      results[index] = { taskName: name, success, taskResult };
    };

    // Schedule in dependency waves: every pending task whose dependencies have
    // all succeeded is independent of the others in its wave, so the wave runs
    // concurrently. A task whose dependency failed is skipped (its prerequisite
    // edits never happened); a wave that can neither run nor skip anything means
    // the remaining tasks form a cycle.
    while (status.includes('pending')) {
      const ready: number[] = [];
      let skippedAny = false;

      for (const [index, task] of tasks.entries()) {
        if (status[index] !== 'pending') continue;
        const taskDeps = deps[index] ?? [];
        if (taskDeps.some(dep => status[dep] === 'failed')) {
          recordStateChange(
            index,
            task.name,
            false,
            'Skipped: a task it depends on failed.'
          );
          skippedAny = true;
        } else if (taskDeps.every(dep => status[dep] === 'success')) {
          ready.push(index);
        }
      }

      if (isEmptyArray(ready)) {
        if (skippedAny) continue;
        // Nothing can advance and nothing was skipped: the leftovers depend on
        // one another cyclically. Fail them rather than loop forever.
        for (const [index, task] of tasks.entries()) {
          if (status[index] === 'pending') {
            recordStateChange(
              index,
              task.name,
              false,
              'Skipped: cyclic or unresolved dependency.'
            );
          }
        }
        break;
      }

      await Promise.all(
        ready.map(async index => {
          const task = tasks[index];
          if (!task) return;
          const result = await runTaskAgent({
            summary: task.name,
            goal: task.goal,
            channel,
            signal,
            complexity: task.complexity,
          });
          recordStateChange(
            index,
            task.name,
            result.ok,
            result.ok ? result.data : result.error.message
          );
        })
      );
    }

    return Result.Ok({
      results: results.filter((result): result is TaskResult =>
        isNotNil(result)
      ),
    });
  },

  inputToString({ tasks }): string {
    return `Delegating ${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
  },

  outputToString({ results }) {
    if (isEmptyArray(results)) return `No tasks were performed`;

    const failedTasks = results.filter(res => !res.success);

    if (isEmptyArray(failedTasks)) {
      return `All tasks finished`;
    }

    return `\`${results.length - failedTasks.length}\` out of \`${results.length}\` tasks succeeded`;
  },
});
