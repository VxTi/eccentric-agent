import { vertex } from '@ai-sdk/google-vertex';
import {
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
  type Tool,
  tool as createTool,
  type ToolSet,
} from 'ai';
import chalk from 'chalk';
import compact from 'lodash/compact';
import first from 'lodash/first';
import { glob } from 'node:fs/promises';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { DEFAULT_SYSTEM_PROMPT, MAX_TASK_CONTINUATION_ITERATIONS } from '../../lib/constants';
import {
  type AgentMessageEvent,
  emitEvent,
  EventName,
  subscribeEvent,
  SyncAgentContextEvent,
  unsubscribeEvent,
} from '../../lib/events';
import { FileCache } from '../../lib/file-cache';
import { Result } from '../../lib/result';
import { TaskList, TaskStatus } from '../../lib/tasks';
import { emitAgentMessage, requestUserInput } from '../../lib/user-input';
import { type ToolBase, toolRegistry, ToolSelectionOption } from '../../tools';
import { formatMarkdown, previewArgs } from '../formatting';
import { useSignal } from './application-cancellation';

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
  messages: ModelMessage[];
  setMessages: Dispatch<SetStateAction<ModelMessage[]>>;

  status: AgentStatus;
  setStatus: Dispatch<SetStateAction<AgentStatus>>;
}

const PrimaryAgentContext = createContext<AgentContext | null>(null);

export function AgentProvider({ children }: { children: ReactNode }): ReactNode {
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [cwd, setCwd] = useState<string>(process.cwd());
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>({
    loading: false,
    text: '',
  });

  const signal = useSignal();

  const fileCache = useMemo(() => new FileCache(cwd), [cwd]);
  const taskList = useMemo(() => new TaskList(), []);

  const tools = useMemo<ToolSet>(() => constructToolset(toolRegistry), []);
  const model = useMemo<LanguageModel>(() => vertex('gemini-2.5-flash'), []);
  const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPT);

  useEffect(() => {
    let cancelled = false;
    void constructSystemPrompt(taskList, cwd).then(prompt => {
      if (!cancelled) setSystemPrompt(prompt);
    });
    return () => {
      cancelled = true;
    };
  }, [taskList, cwd]);

  useEffect(() => {
    const handler = (event: AgentMessageEvent) => {
      setMessages(prev => [...prev, event.detail]);
    };
    subscribeEvent(EventName.AGENT_MESSAGE, handler);

    return () => {
      unsubscribeEvent(EventName.AGENT_MESSAGE, handler);
    };
  }, []);

  const processRequest = useCallback(
    async (prompt: string) => {
      setStatus({ text: 'Processing...', loading: true });

      const updatedMessages: ModelMessage[] = [...messages, { role: 'user', content: prompt }];
      setMessages(updatedMessages);

      const result = streamText({
        allowSystemInMessages: true,
        abortSignal: signal,
        model,
        messages: [{ content: systemPrompt, role: 'system' }, ...updatedMessages],
        tools,
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        },
        stopWhen: stepCountIs(20),
      });

      let buffer = '';
      try {
        for await (const chunk of result.textStream) {
          buffer += chunk;
          setMessages([...updatedMessages, { role: 'assistant', content: buffer }]);
        }
      } catch (err) {
        setMessages([
          ...updatedMessages,
          {
            role: 'assistant',
            content: `Something went wrong whilst responding: ${String(err)}`,
          },
        ]);
        return;
      }

      const response = await result.response;

      setStatus({ text: '', loading: false });
      setMessages([
        ...updatedMessages,
        ...response.messages,
        { role: 'assistant', content: buffer },
      ]);

      let taskIterations = 0;
      while (taskList.hasIncompleteTasks() && taskIterations < MAX_TASK_CONTINUATION_ITERATIONS) {
        taskIterations += 1;
        messages.push({
          content:
            'The task list still has incomplete tasks. Continue working on the' +
            ' next pending or in-progress task and update the task list as you' +
            ' make progress. Do not wait for further user input.',
          role: 'user',
        });
      }

      const firstQueuedMessage = messageQueue.shift();
      if (firstQueuedMessage) {
        await processRequest(firstQueuedMessage);
      }
    },
    [messageQueue, messages, model, signal, systemPrompt, taskList, tools]
  );

  const submitMessage = useCallback(
    (input: string) => {
      if (status.loading) {
        // If we're streaming something, we'll add the input message to the queue
        setMessageQueue(prev => [...prev, input]);
        return;
      }
      void processRequest(input);
    },
    [processRequest, status.loading]
  );

  return (
    <PrimaryAgentContext.Provider
      value={{
        messages,
        setMessages,
        cwd,
        setCwd,
        submitMessage,
        taskList,
        fileCache,
        status,
        setStatus,
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

async function constructSystemPrompt(taskList: TaskList, cwd: string): Promise<string> {
  const systemPrompt = await loadSystemPrompt(cwd);

  const taskFragment = constructTaskListSystemPromptFragment(taskList);
  return compact([systemPrompt, taskFragment]).join('\n');
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
