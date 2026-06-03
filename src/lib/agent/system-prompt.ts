import compact from 'lodash/compact';
import first from 'lodash/first';
import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { CONSTANT_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT } from '../constants';
import { type TaskList, TaskStatus } from '../tasks';
import type { MCP } from './mcp/mcp';

export async function constructSystemPrompt(
  taskList: TaskList,
  mcps: MCP[],
  cwd: string
): Promise<string> {
  const systemPrompt = await loadSystemPrompt(cwd);

  const mcpServerNames = (
    await Promise.all(
      mcps.map(async mcp => {
        const { tools } = await mcp.withAuth(() => mcp.client.listTools());
        return `- ${mcp.name}\n   With tools:\n${tools.map(t => `   - ${t.name}`).join('\n')}`;
      })
    )
  ).join('\n');
  const taskFragment = constructTaskListSystemPromptFragment(taskList);
  return compact([
    systemPrompt,
    CONSTANT_SYSTEM_PROMPT,
    `The following MCP servers are available:\n${mcpServerNames}\nUse 'list_mcp_tools' to discover tools (no 'toolName' → name+description list; with a specific 'toolName' → that tool's full input/output schema). Always fetch the schema for a specific tool before invoking it via 'call_mcp_tool'.`,
    taskFragment,
  ]).join('\n');
}

function constructTaskListSystemPromptFragment(
  taskList: TaskList
): string | null {
  if (!taskList.hasTasks) return null;

  const lines = taskList.tasks.map(task => {
    const mapping: Record<TaskStatus, string> = {
      [TaskStatus.COMPLETED]: '[x]',
      [TaskStatus.IN_PROGRESS]: '[~]',
      [TaskStatus.PENDING]: '[ ]',
    };
    return `  ${mapping[task.status]} (${task.id}) ${task.description}`;
  });

  return [
    'Current task list (markers: [ ] pending, [~] in_progress, [x] completed):',
    ...lines,
    'While any task is not completed you MUST keep working autonomously.' +
      ' Use `update_task_list` to mark tasks "in_progress" before starting' +
      ' and "completed" when done. Only stop once every task is completed.',
  ].join('\n');
}

async function loadSystemPrompt(cwd: string): Promise<string> {
  const supportedFileNames: string[] = [
    'AGENTS',
    'AGENT',
    'SKILL',
    'CLAUDE',
    'claude',
    'copilot-instructions',
  ];
  const agentFile = await Array.fromAsync(
    glob(`**/{${supportedFileNames.join(',')}}.md`, { cwd })
  );
  const firstFile = first(agentFile);
  if (!firstFile) return DEFAULT_SYSTEM_PROMPT;

  return readFileSync(firstFile, 'utf-8');
}
