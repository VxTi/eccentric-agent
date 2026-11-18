import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { Agent } from '../agent/agent';
import type { Message } from '../types/messages';
import { defaultController } from './app';

export interface AgentState {
  /** User-facing message log rendered by the UI. */
  messages: Message[];
  /** The agent instance that owns all inference state (model messages, tasks,
   *  skills, MCP servers, file cache, status). It is the single source of truth
   *  for the agent; the UI only integrates with this instance. */
  agent: Agent;
}

const initialState: AgentState = {
  messages: [],
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
      } else {
        state.messages[i] = action.payload;
      }
    },
    clearMessages: state => {
      state.messages = [];
    },
  },
});

export const { setMessages, addMessage, setMessage, clearMessages } =
  agentSlice.actions;

export const agent = {
  ...agentSlice.actions,
  reducer: agentSlice.reducer,
  slice: agentSlice,
};
