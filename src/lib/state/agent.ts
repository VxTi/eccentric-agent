import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type ModelMessage } from 'ai';
import { TaskList, type Task, type TaskUpdate } from '../tasks';
import { FileCache } from '../file-cache';
import type { Message } from '../types/messages';
import type { ModelName } from '../agent/provider';
import type { MCP } from '../agent/mcp/mcp';
import { DEFAULT_SYSTEM_PROMPT } from '../constants';

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
  model: ModelName;
  mcpServers: MCP[];
  systemPrompt: string;
  messageQueue: string[];
}

const initialState: AgentState = {
  taskList: new TaskList(),
  fileCache: new FileCache(),
  messages: [],
  modelMessages: [],
  status: {
    loading: false,
    text: '',
  },
  model: 'gemini-2.5-flash',
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
    setModelMessages: (state, action: PayloadAction<ModelMessage[]>) => {
      // @ts-expect-error Immer draft recursion incompatibility with AI SDK ModelMessage URL type
      state.modelMessages = action.payload;
    },
    addModelMessage: (state, action: PayloadAction<ModelMessage>) => {
      // @ts-expect-error Immer draft recursion incompatibility with AI SDK ModelMessage URL type
      state.modelMessages.push(action.payload);
    },
    setStatus: (state, action: PayloadAction<AgentStatus>) => {
      state.status = action.payload;
    },
    setModel: (state, action: PayloadAction<ModelName>) => {
      state.model = action.payload;
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
  setStatus,
  setModel,
  setSystemPrompt,
  setMcpServers,
  setTaskList,
  setTasks,
  updateTasks,
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
