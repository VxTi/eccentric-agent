import { vertex } from '@ai-sdk/google-vertex';
import {
  type LanguageModel,
  type ModelMessage,
  type Tool,
  tool as createTool,
  type ToolSet,
} from 'ai';
import chalk from 'chalk';
import first from 'lodash/first';
import { glob } from 'node:fs/promises';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  emitEvent,
  EventName,
  subscribeEvent,
  SyncAgentContextEvent,
  unsubscribeEvent,
} from '../../lib/events';
import { FileCache } from '../../lib/file-cache';
import { Result } from '../../lib/result';
import { DEFAULT_SYSTEM_PROMPT } from '../../lib/constants';
import { TaskList, TaskStatus } from '../../lib/tasks';
import { emitAgentMessage, requestUserInput } from '../../lib/user-input';
import { type ToolBase, toolRegistry, ToolSelectionOption } from '../../tools';
import { formatMarkdown, previewArgs } from '../formatting';

export type Message = Extract<ModelMessage, { role: 'assistant' | 'user' }>;

interface AgentStatus {
  loading: boolean;
  text: string;
}

export interface AgentContext {
  cwd: string;
  setCwd: Dispatch<SetStateAction<string>>;
  submitMessage: (input: string) => void;
  taskList: TaskList;
  fileCache: FileCache;
  messages: Message[];

  status: AgentStatus;
  setStatus: Dispatch<SetStateAction<string>>;
}

const PrimaryAgentContext = createContext<AgentContext | null>(null);

export function AgentProvider({ children }: { children: ReactNode }): ReactNode {
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [cwd, setCwd] = useState<string>(process.cwd());
  const [messages, setMessages] = useState<ModelMessage[]>([]);

  const [status, setStatus] = useState<AgentStatus>({ loading: false, text: '' });

  const fileCache = useMemo(() => new FileCache(cwd), [cwd]);
  const taskList = useMemo(() => new TaskList(), []);

  const model = useMemo<LanguageModel>(() => {
    return vertex('gemini-2.5-flash');
  }, []);

  const tools = useMemo<ToolSet>(() => constructToolset(toolRegistry), [context]);

  const submitMessage = useCallback(
    (input: string) => {
      setMessageQueue(prev => {
        // if (prev.length === 0) const totalQueue = [...prev, input];
      });
    },
    [messageQueue.length]
  );

  return (
    <PrimaryAgentContext.Provider
      value={{
        messages: messages.filter((m): m is Message => m.role === 'user' || m.role === 'assistant'),
        cwd,
        setCwd,
        submitMessage,
        taskList,
        fileCache,
        statusText,
        setStatusText,
        loading,
        setLoading,
      }}
    >
      {children}
    </PrimaryAgentContext.Provider>
  );
}

export function useAgent(): AgentContext {
  const runtime = useContext(PrimaryAgentContext);
  if (!runtime) {
    throw new Error('useAgent must be used inside <AgentProvider>');
  }
  return runtime;
}

function constructTaskListSystemPromptFragment(taskList: TaskList): string | null {
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
  const agentFile = await Array.fromAsync(glob(`**/{${supportedFileNames.join(',')}}.md`, { cwd }));
  return first(agentFile) ?? DEFAULT_SYSTEM_PROMPT;
}

function constructToolset(tools: ToolBase[]): ToolSet {
  return Object.fromEntries(tools.map(tool => [tool.internalName, constructTool(tool)]));
}

function constructTool(tool: ToolBase): Tool {
  const { description, inputSchema, outputSchema } = tool;
  return createTool({
    description,
    inputSchema,
    outputSchema,
    execute: async (input: unknown) => {
      const requiresApproval = await tool.requiresApproval(input);

      if (requiresApproval) {
        const options = await tool.approvalOptions(input);

        const chosen = await requestUserInput({
          title: 'Approval required',
          description: `Tool "${tool.internalName}" requires approval\n ↳ ${previewArgs(input)}`,
          options: options.map(opt => ({ label: opt.text, id: opt.option })),
        });
        const selectionOption = await tool.onOptionSelect(input, chosen.id);

        if (selectionOption !== ToolSelectionOption.ALLOW) {
          return Result.Error(`User denied permission to run tool "${tool.internalName}".`);
        }
      }
      emitAgentMessage(formatMarkdown(tool.inputToString(input)));

      let output: unknown;
      try {
        output = await tool.handle(input);
      } catch (err) {
        const message = `Tool "${tool.internalName}" failed: ${String(err)}`;
        emitAgentMessage(chalk.red(`${message}\n`));
        return Result.Error(message);
      }

      emitAgentMessage(`↳ ${formatMarkdown(tool.outputToString(output))}\n`);
      return output;
    },
  });
}

export async function acquireContextInstance(): Promise<AgentContext> {
  return new Promise(resolve => {
    const handler = (event: SyncAgentContextEvent) => {
      if (event.detail.type === 'sync-context-response') {
        unsubscribeEvent(EventName.SYNC_AGENT_CONTEXT, handler);
        resolve(event.detail.context);
      }
    };

    emitEvent(new SyncAgentContextEvent({ type: 'sync-context' }));
    subscribeEvent(EventName.SYNC_AGENT_CONTEXT, handler);
  });
}
