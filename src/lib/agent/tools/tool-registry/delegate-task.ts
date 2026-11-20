import { isEmptyArray } from '@vxti/typed';
import * as z from 'zod';
import { Result } from '../../../result';
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
  readFile,
  replaceInFile,
} from './file-system';
import { getUserLocation } from './get-user-location';
import { getUserTime } from './get-user-time';
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
  getUserTime,
  getUserLocation,
  createTaskList,
  updateTaskList,
  discoverMcpTool,
  listMcpTools,
  callMcpTool,
  useSkill,
  shell,
  replaceInFile,
  createFile,
] as const;

const taskSpecSchema = z.object({
  name: z
    .string()
    .describe(
      'A short, unique label for this task (e.g. `rename-helper`,' +
        ' `add-export`). Used only to identify its result in the output.'
    ),
  goal: z
    .string()
    .describe(
      'The complete, self-contained instruction for this task. The task agent has NO access to your' +
        ' conversation history, so include every piece of context, constraint, and success criterion it' +
        ' needs. State explicitly what the final result should contain and which files or commands are' +
        ' involved.'
    ),
});

const inputSchema = z.object({
  tasks: z
    .array(taskSpecSchema)
    .describe(
      'A list of small, self-contained tasks to carry out. Each task is handled by its own capable' +
        ' agent that can read, search, write files and run shell commands. Tasks run sequentially in the' +
        ' order given, because they share the same workspace and later tasks may depend on earlier edits.'
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

async function runTaskAgent(
  summary: string,
  goal: string,
  channel: NotifierChannel<ToolChannelParams>,
  signal: AbortSignal
): Promise<Result<string, Error>> {
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
    });
  });
}

export const delegateTask = createTool({
  internalName: 'delegate_task',
  name: 'Delegate Task',
  description:
    'Delegates concrete, self-contained units of work — above all any work that WRITES — to sub-agents' +
    ' that can read, search, edit files and run shell commands. THIS IS THE DEFAULT TOOL FOR MULTI-STEP' +
    ' CODE/RESEARCH WORK: whenever a request breaks into one or more independent pieces that each involve editing,' +
    ' creating, or verifying files, or running commands, dispatch them here as separate tasks instead of' +
    ' performing them serially in your own loop. Reach for it proactively, not as a last resort —' +
    ' refactors spanning several files, adding a feature across layers, renaming a symbol and updating its' +
    ' callers, scaffolding a module and wiring it into an index, migrating a set of call sites, or running' +
    ' a build or test suite and repairing what it reports. Boundary with the other tools: for' +
    ' purely read-only work (gathering, summarizing, comparing, auditing), search and read inline' +
    ' with `grep`, `find_in_file`, or `read_file` instead — those are cheaper than a sub-agent;' +
    ' use `create_task_list` when the stages are large, ordered, and' +
    ' dependent work accordingly. Each task agent receives ONLY the goal you provide, with no access to' +
    ' your conversation history, so make every goal fully self-contained: exact file paths, constraints,' +
    ' and the shape of the expected result. Keep each task small enough for one agent to finish — a batch' +
    ' of three tight tasks beats one vague task.',
  inputSchema,
  outputSchema,

  async handle({ tasks }, channel, signal) {
    const results: TaskResult[] = [];

    // Sequential, not parallel: these agents write to a shared workspace, so
    // concurrent edits could conflict and later tasks may rely on earlier ones.
    for (const { goal, name } of tasks) {
      const result = await runTaskAgent(name, goal, channel, signal);

      results.push({
        taskName: name,
        success: result.ok,
        taskResult: result.ok ? result.data : result.error.message,
      });
    }

    return Result.Ok({ results });
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
