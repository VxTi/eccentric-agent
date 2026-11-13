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
  goal: string,
  channel: NotifierChannel<ToolChannelParams>,
  signal: AbortSignal
): Promise<Result<string, Error>> {
  return new Promise(resolve => {
    const controller = new AbortController();

    signal.addEventListener('abort', () => controller.abort());

    new SubAgent({
      goal,
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
    'Delegates one or more small, concrete, actionable tasks to capable sub-agents that can read, search,' +
    ' write files and run shell commands — more than the read-only research agents spawned by' +
    ' `spawn_agents`. Use this when a request can be split into a handful of small, well-defined pieces of' +
    ' work (e.g. "add an export and update the index", "rename this helper and fix its callers",' +
    ' "scaffold a file and wire it up") that each stand on their own and do NOT warrant a full task list.' +
    ' Each task agent receives ONLY the goal you provide, with no access to your conversation history, so' +
    ' make every goal fully self-contained with all necessary context, file paths, constraints, and the' +
    ' exact shape of the expected result. Tasks run sequentially in the order given, so order them when a' +
    ' later task depends on an earlier one. Prefer `spawn_agents` for read-only research and aggregation,' +
    ' and a proper task list for large, multi-stage work.',
  inputSchema,
  outputSchema,

  async handle({ tasks }, channel, signal) {
    const results: TaskResult[] = [];

    // Sequential, not parallel: these agents write to a shared workspace, so
    // concurrent edits could conflict and later tasks may rely on earlier ones.
    for (const { goal, name } of tasks) {
      const result = await runTaskAgent(goal, channel, signal);

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
