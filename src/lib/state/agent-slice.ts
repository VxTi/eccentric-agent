import { entries, isNonEmptyString } from '@vxti/typed';
import chalk from 'chalk';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { Agent } from '../agent/agent';
import { type ToolIdentifier } from '../agent/tools';
import type { ReasoningState } from '../events/events';
import type {
  CollapsedToolCalls,
  GenericMessage,
  Message,
} from '../types/messages';
import { defaultController } from './app';

export interface AgentState {
  /** User-facing message log rendered by the UI. */
  messages: Message[];
  /** Whether the model is currently reasoning, mirrored from the agent's
   *  reasoning lifecycle events. Drives the UI's thinking indicator. */
  reasoning: ReasoningState;
  /** Whether Auto mode is enabled, mirrored from the agent's auto-mode events.
   *  In Auto mode, shell commands cleared by the decision model run without a
   *  manual approval prompt. */
  autoApprove: boolean;
  /** The agent instance that owns all inference state (model messages, tasks,
   *  skills, MCP servers, file cache, status). It is the single source of truth
   *  for the agent; the UI only integrates with this instance. */
  agent: Agent;
}

const initialState: AgentState = {
  messages: [],
  reasoning: { active: false },
  autoApprove: false,
  agent: new Agent(defaultController.signal, process.cwd()),
};

export const agentSlice = createSlice({
  name: 'agent',
  initialState,
  reducers: {
    setMessages: (state, action: PayloadAction<Message[]>) => {
      state.messages = action.payload;
    },
    addMessage: (state, action: PayloadAction<Message>) => {
      state.messages.push(action.payload);
    },
    setMessage: (state, action: PayloadAction<Message>) => {
      const i = state.messages.findIndex(m => m.id === action.payload.id);
      if (i < 0) {
        state.messages.push(action.payload);
        collapseCompletedToolCalls(state as never, state.messages.length - 1);
      } else {
        state.messages[i] = action.payload;
        collapseCompletedToolCalls(state as never, i);
      }
    },
    setReasoning: (state, action: PayloadAction<ReasoningState>) => {
      state.reasoning = action.payload;
    },
    setAutoApprove: (state, action: PayloadAction<boolean>) => {
      state.autoApprove = action.payload;
    },
    clearMessages: state => {
      state.messages = [];
    },
  },
});

export const {
  setMessages,
  addMessage,
  setMessage,
  setReasoning,
  setAutoApprove,
  clearMessages,
} = agentSlice.actions;

export const agent = {
  ...agentSlice.actions,
  reducer: agentSlice.reducer,
  slice: agentSlice,
};

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

function isCompletedToolCall(
  message: Message | undefined
): message is GenericMessage & { toolCall: string } {
  return (
    message !== undefined &&
    message.type === 'generic' &&
    message.toolCall !== undefined &&
    message.loading !== true
  );
}

/**
 * Collapse the message at `index` into the preceding message when both are
 * completed tool-call messages, replacing the pair with a single aggregate
 * line ("N tool calls — …"). Messages still loading stay expanded so the
 * spinner and the running tool remain visible.
 */
function collapseCompletedToolCalls(state: AgentState, index: number): void {
  const message = state.messages[index];
  if (index === 0 || !isCompletedToolCall(message)) return;

  const previous = state.messages[index - 1];
  if (!isCompletedToolCall(previous)) return;

  const prevCall = previous.toolCall;
  const msgCall = message.toolCall;

  const tools: Record<string, number> = {
    ...(previous.collapsed?.tools ?? { [prevCall]: 1 }),
  };
  tools[msgCall] = (tools[msgCall] ?? 0) + 1;
  const count = (previous.collapsed?.count ?? 1) + 1;
  const failure =
    (previous.collapsed?.failure ?? previous.failure === true) ||
    message.failure === true;

  const collapsed: CollapsedToolCalls = { count, tools, failure };
  state.messages[index - 1] = {
    id: previous.id,
    type: 'generic',
    loading: false,
    failure,
    toolCall: msgCall,
    collapsed,
    content: formatCollapsedToolCalls(collapsed),
  };
  state.messages.splice(index, 1);
}

function formatCollapsedToolCalls(collapsed: CollapsedToolCalls): string {
  const label = `${collapsed.count} tool call${
    collapsed.count === 1 ? '' : 's'
  }`;
  const summary = entries(collapsed.tools)
    .map(([name, count]) => {
      const summarize = TOOL_COLLAPSE_SUMMARIES[name];
      return summarize ? summarize(count ?? 0) : `${name} ×${count}`;
    })
    .join(', ');

  const parts = [label];
  if (isNonEmptyString(summary, true)) parts.push(summary);
  if (collapsed.failure) parts.push('with failures');
  return chalk.dim(parts.join(' — '));
}
