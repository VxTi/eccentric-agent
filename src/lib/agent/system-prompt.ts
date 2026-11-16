import { isNil, type Nullable } from '@vxti/typed';
import compact from 'lodash/compact';
import first from 'lodash/first';
import fs from 'node:fs';
import { CONSTANT_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT } from '../constants';
import { type TaskList, TaskStatus } from '../tasks';
import type { MCP } from './mcp/mcp';
import { type AgentSkill } from './skills/common';

interface ConstructSystemPromptProps {
  taskList: TaskList;
  mcps: MCP[];
  skills: AgentSkill[];
  activeSkills: Record<string, AgentSkill>;
  cwd: string;
  gitIgnore: Set<string>;
}

export async function constructSystemPrompt({
  taskList,
  mcps,
  skills,
  activeSkills,
  cwd,
  gitIgnore,
}: ConstructSystemPromptProps): Promise<string> {
  const systemPrompt = await loadSystemPrompt({ cwd, ignored: gitIgnore });

  const mcpServerNames = (
    await Promise.all(
      mcps.map(async mcp => {
        const { tools } = await mcp.withAuth(() =>
          mcp.params.client.listTools()
        );
        return `- ${mcp.params.name}\n    With tools:\n${tools.map(t => `   - ${t.name}`).join('\n')}`;
      })
    )
  ).join('\n');

  const skillsSummary = skills
    .map(skill => `- Name: ${skill.name}.\nDescription:\n${skill.description}`)
    .join('\n---');

  const taskFragment = constructTaskListSystemPromptFragment(taskList);

  return compact([
    systemPrompt,
    CONSTANT_SYSTEM_PROMPT,
    'Some important information:',
    `- The working dir is '${cwd}'.`,
    `- The current user is ${process.env.USER ?? process.env.USERNAME}.`,
    `- The current date is ${new Date().toLocaleString()}.\n`,
    'You have access to the following tools, which are described by `name` and `description`. Use them if the current context relates to the description:',
    skillsSummary,
    'You possess the following skills, which you must obey / utilise:\n',
    Object.entries(activeSkills)
      .map(([skillName, skill]) => ` ${skillName}:    ${skill.content}`)
      .join('\n\n'),
    `The following MCP servers are available:\n${mcpServerNames}\nUse 'list_mcp_tools' to discover tools (no 'toolName' → name+description list; with a specific 'toolName' → that tool's full input/output schema). Always fetch the schema for a specific tool before invoking it via 'call_mcp_tool'.`,
    taskFragment,
  ]).join('\n\n');
}

function constructTaskListSystemPromptFragment(
  taskList: TaskList
): Nullable<string> {
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

async function loadSystemPrompt(globOptions: {
  cwd: string;
  ignored: Set<string>;
}): Promise<string> {
  const supportedFileNames: string[] = [
    'AGENTS',
    'AGENT',
    'SKILL',
    'CLAUDE',
    'claude',
    'copilot-instructions',
  ];
  const agentFile = await Array.fromAsync(
    fs.promises.glob(`**/{${supportedFileNames.join(',')}}.md`, {
      cwd: globOptions.cwd,
      exclude: Array.from(globOptions.ignored),
    })
  );
  const firstFile = first(agentFile);
  if (isNil(firstFile)) return DEFAULT_SYSTEM_PROMPT;

  return fs.readFileSync(firstFile, 'utf-8');
}
