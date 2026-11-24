import type { ReasoningState } from '../events/events';
import type { Message } from '../types/messages';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { Agent } from '../agent/agent';
import { collapseCompletedToolCalls } from '../utils/message-utils';
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

const cwd = process.env.ECA_CWD ?? process.env.CWD ?? process.cwd();

const initialState: AgentState = {
  messages: [],
  reasoning: { active: false },
  autoApprove: false,
  agent: new Agent(defaultController.signal, cwd),
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
        collapseCompletedToolCalls(state.messages, state.messages.length - 1);
      } else {
        state.messages[i] = action.payload;
        collapseCompletedToolCalls(state.messages, i);
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
