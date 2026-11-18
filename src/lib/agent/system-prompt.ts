import type { MCP } from './mcp/mcp';
import type { AgentSkill, SkillName } from './skills/common';
import type { FileCache } from '../file-cache';
import { type TaskList, TaskStatus } from '../tasks';
import { type Nullable, isNil } from '@vxti/typed';
import { first, compact } from 'lodash-es';
import fs from 'node:fs';
import { CONSTANT_SYSTEM_PROMPT, DEFAULT_SYSTEM_PROMPT } from '../constants';

const OPERATING_GUIDE = `# Working efficiently

Spend a tool call only when it yields information you do not already have.

- Reuse context first. If a file's content, a path, or a search result already appears in this
  conversation, do NOT read, find, or search for it again — answer from what is in front of you.
- Batch independent calls. When several reads, searches, or fetches do not depend on one
  another, issue them together in a single step instead of one at a time.
- Pick the narrowest tool for the job:
    • \`find_file\` — locate files by name, extension, or path via a glob. Not for file contents.
    • \`grep\` — search text across many files. Prefer it over running \`grep\`/\`rg\` through \`shell\`.
    • \`find_in_file\` — search within one file you have already identified.
    • \`read_file\` — read the full body of one file you already know you need.
  Never read a whole file just to locate one symbol; \`grep\` or \`find_in_file\` instead.
- Editing workflow: \`read_file\` returns every line prefixed with its 1-based number. Feed those
  numbers to \`replace_in_file\` to change existing lines, or use \`create_file\` for new files. An
  edit is rejected if the file changed on disk since you last read it, so read a file before
  editing it and re-read it after any external change.
- Prefer dedicated tools over \`shell\`. \`shell\` is restricted to an allow-list and needs user
  approval; reach for it only when no dedicated tool fits.
- Delegate only substantial, independent work: \`delegate_task\` for pieces that write files or
  run commands, \`spawn_agents\` for read-only research spread across separate sources. For a
  couple of files, read them yourself — spinning up an agent costs more than it saves.`;

interface Props {
  mcpServers: Set<MCP>;
  skills: Map<SkillName, AgentSkill>;
  taskList: TaskList;
  activeSkills: Map<SkillName, AgentSkill>;
  fileCache: FileCache;
  cwd: string;
  gitIgnore: Set<string>;
}

export async function constructSystemPrompt({
  mcpServers,
  cwd,
  gitIgnore,
  taskList,
  activeSkills,
  skills,
}: Props): Promise<string> {
  const systemPrompt = await loadSystemPrompt({ cwd, ignored: gitIgnore });

  const mcpServerNames = (
    await Promise.all(
      mcpServers.values().map(async mcp => {
        const { tools } = await mcp.withAuth(() =>
          mcp.params.client.listTools()
        );
        return `- ${mcp.params.name}\n    With tools:\n${tools.map(t => `   - ${t.name}`).join('\n')}`;
      })
    )
  ).join('\n');

  const skillsSummary = skills
    .values()
    .map(skill => `- Name: ${skill.name}.\nDescription:\n${skill.description}`)
    .toArray()
    .join('\n---');

  const taskFragment = constructTaskListSystemPromptFragment(taskList);

  return compact([
    systemPrompt,
    CONSTANT_SYSTEM_PROMPT,
    'Some important information:',
    `- The working dir is '${cwd}'.`,
    `- The current user is ${process.env.USER ?? process.env.USERNAME}.`,
    `- The current date is ${new Date().toLocaleString()}.\n`,
    OPERATING_GUIDE,
    'You have access to the following skills, which are described by `name` and `description`. Use the \`use_skill\`' +
      ' tool to invoke them if the current context relates to the description:',
    skillsSummary,
    'You possess the following skills, which you must obey / utilise:\n',
    Array.from(activeSkills.entries())
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
