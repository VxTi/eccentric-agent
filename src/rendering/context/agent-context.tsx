import {
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
import { readFileSync } from 'node:fs';
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
import { loadMcpConfig, type MCP } from '../../lib/agent/mcp/mcp';
import { geminiProvider, type ModelName } from '../../lib/agent/provider';
import {
  CONSTANT_SYSTEM_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
} from '../../lib/constants';
import { emitConsumeTokenEvent } from '../../lib/events/emission';
import {
  type AgentContextSyncResult,
  type AgentMessageEvent,
  emitEvent,
  EventName,
  subscribeEvent,
  TokenSource,
  unsubscribeEvent,
} from '../../lib/events/events';
import { Notifier } from '../../lib/events/notifier';
import {
  emitAgentMessage,
  requestUserInput,
} from '../../lib/events/user-input';
import { FileCache } from '../../lib/file-cache';
import { Result } from '../../lib/result';
import { TaskList, TaskStatus } from '../../lib/tasks';
import type { Message, UserMessage } from '../../lib/types/messages';
import {
  type IToolBase,
  registry,
  type ToolChannelParams,
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
  model: ModelName;
  mcpServers: MCP[];
  systemPrompt: string;
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

  const { taskList, notifier, model, fileCache } = useMemo(() => {
    return {
      taskList: new TaskList(),
      notifier: new Notifier(),
      fileCache: new FileCache(),
      model: geminiProvider('gemini-2.5-flash'),
    };
  }, []);
  const tools = useMemo<ToolSet>(
    () => constructToolset(registry, notifier),
    [notifier]
  );
  const [systemPrompt, setSystemPrompt] = useState<string>(
    DEFAULT_SYSTEM_PROMPT
  );

  const [mcpServers, setMcpServers] = useState<MCP[]>([]);

  useEffect(() => {
    void loadMcpConfig(signal)
      .catch(() => [])
      .then(setMcpServers);
  }, [signal]);

  /**
   * System prompt construction
   */
  useEffect(() => {
    let cancelled = false;
    void constructSystemPrompt(taskList, mcpServers, cwd).then(prompt => {
      if (!cancelled) setSystemPrompt(prompt);
    });

    return () => {
      cancelled = true;
    };
  }, [taskList, cwd, mcpServers]);

  /**
   * Message addition / updates
   */
  const setMessage = useCallback((newMessage: Message) => {
    setMessages(prev => {
      const i = prev.findIndex(m => m.id === newMessage.id);
      if (i < 0) return [...prev, newMessage];
      const next = prev.slice();
      next[i] = newMessage;
      return next;
    });
  }, []);

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
          emitConsumeTokenEvent({
            input: step.usage.inputTokens ?? 0,
            output: step.usage.outputTokens ?? 0,
            source: TokenSource.PRIMARY,
          });
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
        systemPrompt,
        model: (typeof model === 'string' ? model : model.modelId) as ModelName,
        messages,
        setMessages,
        mcpServers,
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
  mcps: MCP[],
  cwd: string
): Promise<string> {
  const systemPrompt = await loadSystemPrompt(cwd);

  const mcpServerNames = mcps.map(mcp => `- ${mcp.name}`).join('\n');
  const taskFragment = constructTaskListSystemPromptFragment(taskList);
  return compact([
    systemPrompt,
    CONSTANT_SYSTEM_PROMPT,
    `The following MCP servers are available:\n${mcpServerNames}`,
    taskFragment,
  ]).join('\n');
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
  const firstFile = first(agentFile);
  if (!firstFile) return DEFAULT_SYSTEM_PROMPT;

  return readFileSync(firstFile, 'utf-8');
}

function constructToolset(tools: IToolBase[], notifier: Notifier): ToolSet {
  return Object.fromEntries(
    tools.map(tool => [tool.internalName, constructTool(tool, notifier)])
  );
}

function constructTool(tool: IToolBase, notifier: Notifier): Tool {
  const { description, inputSchema, outputSchema, name } = tool;
  return createTool({
    title: name,
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

      const inputText = formatMarkdown(tool.inputToString(input, channel));

      emitAgentMessage({
        type: 'generic',
        id: toolCallId,
        loading: true,
        content: inputText,
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
        content: `→ ${formatMarkdown(tool.outputToString(output, channel))}`,
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
