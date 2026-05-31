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
import { v7 as uuid } from 'uuid';
import { DEFAULT_SYSTEM_PROMPT } from '../../lib/constants';
import { emitConsumeTokenEvent } from '../../lib/events/emission';
import {
  type AgentContextSyncResult,
  type AgentMessageEvent,
  emitEvent,
  EventName,
  subscribeEvent,
  unsubscribeEvent,
} from '../../lib/events/events';
import { FileCache } from '../../lib/file-cache';
import type { Message, UserMessage } from '../../lib/types/messages';
import { Notifier } from '../../lib/events/notifier';
import { geminiProvider } from '../../lib/agent/provider';
import { Result } from '../../lib/result';
import { TaskList, TaskStatus } from '../../lib/tasks';
import {
  emitAgentMessage,
  requestUserInput,
} from '../../lib/events/user-input';
import {
  type IToolBase,
  type ToolChannelParams,
  registry,
  ToolSelectionOption,
} from '../../tools';
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
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setModelMessages: Dispatch<SetStateAction<ModelMessage[]>>;
  status: AgentStatus;
  setStatus: Dispatch<SetStateAction<AgentStatus>>;
}

const PrimaryAgentContext = createContext<AgentContext | null>(null);

export function AgentProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [cwd, setCwd] = useState<string>(process.cwd());

  const [modelMessages, setModelMessages] = useState<ModelMessage[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const [status, setStatus] = useState<AgentStatus>({
    loading: false,
    text: '',
  });

  const signal = useSignal();

  const fileCache = useMemo(() => new FileCache(cwd), [cwd]);
  const taskList = useMemo(() => new TaskList(), []);

  const notifier = useMemo(() => new Notifier(), []);
  const tools = useMemo<ToolSet>(
    () => constructToolset(registry, notifier),
    [notifier]
  );
  const model = useMemo<LanguageModel>(
    () => geminiProvider('gemini-2.5-flash'),
    []
  );
  const [systemPrompt, setSystemPrompt] = useState<string>(
    DEFAULT_SYSTEM_PROMPT
  );

  /**
   * System prompt construction
   */
  useEffect(() => {
    let cancelled = false;
    void constructSystemPrompt(taskList, cwd).then(prompt => {
      if (!cancelled) setSystemPrompt(prompt);
    });
    return () => {
      cancelled = true;
    };
  }, [taskList, cwd]);

  /**
   * Message addition / updates
   */
  const setMessage = useCallback(
    (message: Message) => {
      const existingMessage = messages.findIndex(msg => msg.id === message.id);

      // If it doesn't exist already ,append it to the existing one
      if (existingMessage < 0) {
        setMessages(prev => [...prev, message]);
        return;
      }

      setMessages(prev => {
        const copy = [...prev];

        copy[existingMessage] = message;
        return copy;
      });
    },
    [messages]
  );

  /**
   * Handling incoming messages from non-react world, and token consumption
   */
  useEffect(() => {
    const handleIncomingMessage = (event: AgentMessageEvent) => {
      setMessage(event.detail);
    };

    subscribeEvent(EventName.AGENT_MESSAGE, handleIncomingMessage);

    return () => {
      unsubscribeEvent(EventName.AGENT_MESSAGE, handleIncomingMessage);
    };
  }, [setMessage]);

  const processRequest = useCallback(
    async (prompt: string, quiet: boolean) => {
      setStatus({ text: 'Processing...', loading: true });

      const updatedMessages: ModelMessage[] = [
        ...modelMessages,
        { role: 'user', content: prompt },
      ];
      setModelMessages(updatedMessages);

      if (!quiet) {
        setMessages(prev => [
          ...prev,
          { type: 'user', id: uuid(), content: prompt } satisfies UserMessage,
        ]);
      }

      const result = streamText({
        allowSystemInMessages: true,
        abortSignal: signal,
        model,
        messages: [
          { content: systemPrompt, role: 'system' },
          ...updatedMessages,
        ],
        tools,
        onStepFinish: step => {
          emitConsumeTokenEvent(
            step.usage.inputTokens ?? 0,
            step.usage.outputTokens ?? 0
          );
        },
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
        }
        const response = await result.response;

        setStatus({ text: '', loading: false });
        setModelMessages(prev => [
          ...prev,
          ...response.messages,
          { role: 'assistant', content: buffer },
        ]);
        setMessage({
          type: 'assistant',
          id: uuid(),
          content: buffer,
        });
      } catch (err) {
        setMessage({
          type: 'generic',
          id: uuid(),
          failure: true,
          content: `Something went wrong whilst responding: ${String(err)}`,
        });
        setStatus({ text: chalk.red('Fatal error'), loading: false });
        return;
      }

      const firstQueuedMessage = messageQueue.shift();
      if (firstQueuedMessage) {
        await processRequest(firstQueuedMessage, false);
      }
    },
    [
      messageQueue,
      model,
      modelMessages,
      setMessage,
      signal,
      systemPrompt,
      tools,
    ]
  );

  const submitMessage = useCallback(
    (input: string) => {
      if (status.loading) {
        // If we're streaming something, we'll add the input message to the queue
        setMessageQueue(prev => [...prev, input]);
        return;
      }
      void processRequest(input, false);
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
        setModelMessages,
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

async function constructSystemPrompt(
  taskList: TaskList,
  cwd: string
): Promise<string> {
  const systemPrompt = await loadSystemPrompt(cwd);

  const taskFragment = constructTaskListSystemPromptFragment(taskList);
  return compact([systemPrompt, taskFragment]).join('\n');
}

function constructTaskListSystemPromptFragment(
  taskList: TaskList
): string | null {
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
  const agentFile = await Array.fromAsync(
    glob(`**/{${supportedFileNames.join(',')}}.md`, { cwd })
  );
  return first(agentFile) ?? DEFAULT_SYSTEM_PROMPT;
}

function constructToolset(tools: IToolBase[], notifier: Notifier): ToolSet {
  return Object.fromEntries(
    tools.map(tool => [tool.internalName, constructTool(tool, notifier)])
  );
}

function constructTool(tool: IToolBase, notifier: Notifier): Tool {
  const { description, inputSchema, outputSchema } = tool;
  return createTool({
    description,
    inputSchema,
    outputSchema,
    execute: async (input: unknown) => {
      const toolCallId = uuid();

      const channel = notifier.subscribe(
        toolCallId,
        (...[message]: ToolChannelParams) =>
          emitAgentMessage({
            ...message,
            type: 'generic',
            id: toolCallId,
          })
      );

      const requiresApproval = await tool.requiresApproval(input, channel);
      if (requiresApproval) {
        const options = await tool.approvalOptions(input, channel);

        const [chosen] = await requestUserInput({
          title: 'Approval required',
          description: `Tool "${tool.name}" requires approval\n ↳ ${previewArgs(input)}`,
          options: options.map(opt => ({ label: opt.text, id: opt.option })),
          allowMultiple: false,
        });
        console.log(chosen);
        const selectionOption = await tool.onOptionSelect(
          input,
          chosen.id,
          channel
        );

        if (selectionOption !== ToolSelectionOption.ALLOW) {
          notifier.unsubscribe(toolCallId);
          return Result.Error(
            `User denied permission to run tool "${tool.internalName}".`
          );
        }
      }

      emitAgentMessage({
        type: 'generic',
        id: toolCallId,
        loading: true,
        content: formatMarkdown(tool.inputToString(input, channel)),
      });

      let output: unknown;
      try {
        output = await tool.handle(input, channel);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'unknown';
        const message = `Tool "${tool.name}" failed: ${errMsg}`;

        emitAgentMessage({
          type: 'generic',
          id: toolCallId,
          failure: true,
          content: chalk.red(`${message}\n`),
        });
        notifier.unsubscribe(toolCallId);
        return Result.Error(message);
      }

      emitAgentMessage({
        type: 'generic',
        id: toolCallId,
        loading: false,
        content: `→ ${formatMarkdown(tool.outputToString(output, channel))}\n`,
      });
      notifier.unsubscribe(toolCallId);
      return output;
    },
  });
}

export async function acquireContextInstance(): Promise<AgentContext> {
  return new Promise(resolve => {
    const handler = (event: AgentContextSyncResult) => {
      unsubscribeEvent(EventName.CONTEXT_SYNC_RESULT, handler);
      resolve(event.detail);
    };

    subscribeEvent(EventName.CONTEXT_SYNC_RESULT, handler);
    emitEvent(EventName.CONTEXT_SYNC_REQUEST);
  });
}
