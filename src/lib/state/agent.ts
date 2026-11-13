import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type ModelMessage } from 'ai';
import type { MCP } from '../agent/mcp/mcp';
import { type AgentSkill } from '../agent/skills/common';
import { DEFAULT_SYSTEM_PROMPT } from '../constants';
import { FileCache } from '../file-cache';
import { type Task, TaskList, type TaskUpdate } from '../tasks';
import type { Message } from '../types/messages';

export interface AgentStatus {
  loading: boolean;
  text: string;
}

export interface AgentState {
  taskList: TaskList;
  fileCache: FileCache;
  messages: Message[];
  modelMessages: ModelMessage[];
  status: AgentStatus;
  skills: AgentSkill[];
  activeSkills: Record<string, AgentSkill>;
  mcpServers: MCP[];
  systemPrompt: string;
  messageQueue: string[];
}

const initialState: AgentState = {
  taskList: new TaskList(),
  fileCache: new FileCache(),
  messages: [],
  modelMessages: [],
  activeSkills: {},
  status: {
    loading: false,
    text: '',
  },
  skills: [],
  mcpServers: [],
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  messageQueue: [],
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
    setActiveSkills: (
      state,
      action: PayloadAction<Record<string, AgentSkill>>
    ) => {
      state.activeSkills = action.payload;
    },
    setModelMessages: (state, action: PayloadAction<ModelMessage[]>) => {
      // @ts-expect-error Immer draft recursion incompatibility with AI SDK ModelMessage URL type
      state.modelMessages = action.payload;
    },
    addModelMessage: (state, action: PayloadAction<ModelMessage>) => {
      // @ts-expect-error Immer draft recursion incompatibility with AI SDK ModelMessage URL type
      state.modelMessages.push(action.payload);
    },
    setSkills: (state, action: PayloadAction<AgentSkill[]>) => {
      state.skills = action.payload;
    },
    setStatus: (state, action: PayloadAction<AgentStatus>) => {
      state.status = action.payload;
    },
    setSystemPrompt: (state, action: PayloadAction<string>) => {
      state.systemPrompt = action.payload;
    },
    setMcpServers: (state, action: PayloadAction<MCP[]>) => {
      state.mcpServers = action.payload;
    },
    setTaskList: (state, action: PayloadAction<TaskList>) => {
      state.taskList = action.payload;
    },
    setTasks: (state, action: PayloadAction<Task[]>) => {
      state.taskList.set(action.payload);
    },
    updateTasks: (state, action: PayloadAction<TaskUpdate[]>) => {
      state.taskList.updateTasks(action.payload);
    },
    setFileCache: (state, action: PayloadAction<FileCache>) => {
      state.fileCache = action.payload;
    },
    setMessageQueue: (state, action: PayloadAction<string[]>) => {
      state.messageQueue = action.payload;
    },
    enqueueMessage: (state, action: PayloadAction<string>) => {
      state.messageQueue.push(action.payload);
    },
    dequeueMessage: state => {
      state.messageQueue.shift();
    },
  },
});

export const {
  setMessages,
  addMessage,
  setMessage,
  clearMessages,
  setModelMessages,
  addModelMessage,
  setActiveSkills,
  setStatus,
  setSystemPrompt,
  setMcpServers,
  setTaskList,
  setTasks,
  updateTasks,
  setSkills,
  setFileCache,
  setMessageQueue,
  enqueueMessage,
  dequeueMessage,
} = agentSlice.actions;

export const agent = {
  ...agentSlice.actions,
  reducer: agentSlice.reducer,
  slice: agentSlice,
};
