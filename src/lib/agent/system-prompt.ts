import {
  isAlwaysIncluded,
  type StatefulAgentSkill,
  type StatefulSkillMap,
} from './agent-base';
import type { MCP } from './mcp/mcp';
import type { SkillName } from './skills/model';
import {
  type Nullable,
  isNil,
  isNonEmptyString,
  isEmptyArray,
} from '@vxti/typed';
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
  numbers to \`replace_in_file\` as \`lineNumber\`, with the first replaced line's content as
  \`range.leadingAnchor\`, to change existing lines, or use \`create_file\` for new files. The
  leading anchor relocates an edit when lines shifted; if no line matches it the edit is rejected
  and you should re-read the file.
- Endpoints: \`range.trailingAnchor\` (the content of the line the range ends on) is optional
  additional evidence — the leading anchor is always present on its own — but supplying it is what
  lets \`replace_in_file\` tell two copies of a repeated line apart and confirm that \`count\`
  reaches the line you meant. Send it whenever the range spans more than one line, or the leading
  line repeats in the file: an edit whose two endpoints disagree, or that they cannot decide
  between, is rejected before anything is written rather than editing the wrong lines.
  If the anchor instead matches one line either side of the claimed end, \`count\` is
  corrected by one and the adjustment is reported as \`countAdjustment\`.
- Prefer dedicated tools over \`shell\`. \`shell\` is restricted to an allow-list and needs user
  approval; reach for it only when no dedicated tool fits.
- Delegate only substantial, independent work to \`delegate_task\`: it runs independent tasks in
  parallel, takes a \`dependsOn\` chain for tasks that build on each other, and a per-task
  \`complexity\` tier so simple work runs on a cheaper model. For a couple of files, read them
  yourself — spinning up an agent costs more than it saves.`;

interface StaticPromptProps {
  mcpServers: Set<MCP>;
  skills: StatefulSkillMap;
  cwd: string;
  gitIgnore: Set<string>;
}

interface SkillStateChanges {
  activated: StatefulAgentSkill[];
  deactivated: SkillName[];
}

/**
 * Everything that is stable for the lifetime of a session. Built once so
 * providers can cache the prefix; anything that changes during a conversation
 * belongs in the dynamic fragment instead.
 */
export async function constructSystemPrompt({
  mcpServers,
  cwd,
  gitIgnore,
  skills,
}: StaticPromptProps): Promise<string> {
  const systemPrompt = await loadSystemPrompt({ cwd, ignored: gitIgnore });
  const mcpServerNames = await describeMcpServers(mcpServers);

  return compact([
    systemPrompt,
    CONSTANT_SYSTEM_PROMPT,
    'Some important information:',
    `- The working dir is '${cwd}'.`,
    `- The current user is ${process.env.USER ?? process.env.USERNAME}.`,
    `- The current date is ${new Date().toLocaleDateString()}.\n`,
    OPERATING_GUIDE,
    constructSkillsSystemPromptFragment(skills),
    constructAlwaysIncludedSkillsFragment(skills),
    `The following MCP servers are available:\n${mcpServerNames}\nUse 'list_mcp_tools' to discover tools (no 'toolName' → name+description list; with a specific 'toolName' → that tool's full input/output schema). Always fetch the schema for a specific tool before invoking it via 'call_mcp_tool'.`,
  ]).join('\n\n');
}

/**
 * Skill state changes the model has not yet seen in the conversation —
 * activations and deactivations made outside its own `use_skill` calls.
 * Appended to the history once per change, so each skill body is present
 * exactly once instead of being repeated with every state update.
 */
export function constructSkillStateReminder({
  activated,
  deactivated,
}: SkillStateChanges): Nullable<string> {
  const body = compact([
    isEmptyArray(activated) ? undefined : renderSkillBodies(activated),
    ...deactivated.map(
      name =>
        `The skill \`${name}\` has been deactivated; disregard its instructions from here on.`
    ),
  ]).join('\n\n');

  if (!isNonEmptyString(body)) return null;
  return ['<system-reminder>', body, '</system-reminder>'].join('\n');
}

async function describeMcpServers(mcpServers: Set<MCP>): Promise<string> {
  const descriptions = await Promise.all(
    Array.from(mcpServers).map(async mcp => {
      const { tools } = await mcp.withAuth(() => mcp.params.client.listTools());
      return `- ${mcp.params.name}\n    With tools:\n${tools
        .map(t => `   - ${t.name}`)
        .join('\n')}`;
    })
  );
  return descriptions.join('\n');
}

function constructAlwaysIncludedSkillsFragment(
  skills: StatefulSkillMap
): string | undefined {
  const alwaysIncludedSkills = skills
    .values()
    .filter(isAlwaysIncluded)
    .toArray();
  if (isEmptyArray(alwaysIncludedSkills)) return undefined;

  return renderSkillBodies(alwaysIncludedSkills);
}

function constructSkillsSystemPromptFragment(
  skills: StatefulSkillMap
): string | undefined {
  const onDemandSkills = skills
    .values()
    // Lists every on-demand skill regardless of activation state: the
    // catalog must stay stable for prompt caching, while activation is
    // recorded in the conversation history.
    .filter(skill => !isAlwaysIncluded(skill))
    .toArray();
  if (isEmptyArray(onDemandSkills)) return undefined;

  const skillsSummary = onDemandSkills
    .map(skill => `- Name: ${skill.name}.\nDescription:\n${skill.description}`)
    .join('\n---\n');
  return [
    'You have access to the following skills, which are described by `name` and `description`. Use the \\`use_skill\\`' +
      ' tool to invoke them if the current context relates to the description, or when the user asks to use it:',
    skillsSummary,
  ].join('\n\n');
}

function renderSkillBodies(skills: StatefulAgentSkill[]): string {
  return skills
    .map(skill => `# ${skill.name}\n\n${skill.content}`)
    .join('\n\n---\n\n');
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
