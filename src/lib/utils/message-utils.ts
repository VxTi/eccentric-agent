import { entries, isNonEmptyString } from '@vxti/typed';
import chalk from 'chalk';
import { type ToolIdentifier } from '../agent/tools';
import {
  type CollapsedToolCalls,
  type GenericMessage,
  type Message,
  MessageType,
} from '../types/messages';

/** Human-readable summaries for collapsed tool-call listings, keyed by the
 *  tool's internal name. Tools without an entry fall back to `name ×count`. */
const TOOL_COLLAPSE_SUMMARIES: Partial<
  Record<ToolIdentifier, (count: number) => string>
> = {
  read_file: count => `read ${count} ${count === 1 ? 'file' : 'files'}`,
  grep: count => `looked for ${count} ${count === 1 ? 'pattern' : 'patterns'}`,
  shell: count => `ran ${count} ${count === 1 ? 'command' : 'commands'}`,
  create_file: count => `created ${count} ${count === 1 ? 'file' : 'files'}`,
  find_file: count => `looked for ${count} ${count === 1 ? 'file' : 'files'}`,
  replace_in_file: count =>
    `${count} file ${count === 1 ? 'update' : 'updates'}`,
  find_in_file: count =>
    `looked for ${count} ${count === 1 ? 'pattern' : 'patterns'} in files`,
  web_fetch: count => `read ${count} web${count === 1 ? 'page' : 'pages'}`,
  web_search: count => `searched ${count} ${count === 1 ? 'site' : 'sites'}`,
};

function isCollapsableTool(tool: ToolIdentifier) {
  switch (tool) {
    case 'prompt_user_options':
    case 'replace_in_file':
      return false;
    default:
      return true;
  }
}

function isCompletedToolCall(
  message: Message | undefined
): message is GenericMessage & { toolCall: string } {
  return (
    message !== undefined &&
    message.type === MessageType.GENERIC &&
    message.toolCall !== undefined &&
    message.loading !== true
  );
}

/**
 * Collapse the message at `index` into the preceding message when both are
 * completed tool-call messages, replacing the pair with a single aggregate
 * line ("N tool calls — …"). Messages still loading stay expanded so the
 * spinner and the running tool remain visible. Mutates `messages` in place;
 * with an immer draft this still registers as a state update.
 */
export function collapseCompletedToolCalls(
  messages: Message[],
  index: number
): void {
  const message = messages[index];
  if (index === 0 || !isCompletedToolCall(message)) return;

  const previous = messages[index - 1];
  if (!isCompletedToolCall(previous)) return;

  const failure = previous.failure === true || message.failure === true;

  if (failure || !isCollapsableTool(message.toolCall)) return;

  const prevCall = previous.toolCall;
  const msgCall = message.toolCall;

  const tools: Record<string, number> = {
    ...(previous.collapsed?.tools ?? { [prevCall]: 1 }),
  };
  tools[msgCall] = (tools[msgCall] ?? 0) + 1;
  const count = (previous.collapsed?.count ?? 1) + 1;

  const collapsed: CollapsedToolCalls = { count, tools };
  messages[index - 1] = {
    type: MessageType.GENERIC,
    id: previous.id,
    loading: false,
    toolCall: msgCall,
    collapsed,
    content: formatCollapsedToolCalls(collapsed),
  };
  messages.splice(index, 1);
}

function formatCollapsedToolCalls(collapsed: CollapsedToolCalls): string {
  const summary = entries(collapsed.tools)
    .map(([name, count]) => {
      const summarize = TOOL_COLLAPSE_SUMMARIES[name];
      return summarize ? summarize(count ?? 0) : `${name} ×${count}`;
    })
    .join(', ');

  const parts: string[] = [];
  if (isNonEmptyString(summary, true)) parts.push(summary);
  return chalk.dim(parts.join(' — '));
}
