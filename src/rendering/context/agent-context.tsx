import { isNonEmptyString } from '@vxti/typed';
import { type ModelMessage, stepCountIs, streamText, type ToolSet } from 'ai';
import chalk from 'chalk';
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
import { getRandomMessage } from '../../lib/agent/rotating-messages';
import { constructSystemPrompt } from '../../lib/agent/system-prompt';
import { DEFAULT_SYSTEM_PROMPT } from '../../lib/constants';
import { emitConsumeTokenEvent } from '../../lib/events/token-usage';
import { EventName, eventOn, TokenSource } from '../../lib/events/events';
import { Notifier } from '../../lib/events/notifier';
import { Features } from '../../lib/feaures';
import { FileCache } from '../../lib/file-cache';
import { TaskList } from '../../lib/tasks';
import type { Message, UserMessage } from '../../lib/types/messages';
import { toolRegistry } from '../../lib/agent/tools';
import { makeToolSet } from '../../lib/agent/tools/core';
import { basicHighlightFormatting } from '../terminal-markdown-renderer/markdown-renderer';
import { useAppContext } from './app-context';
import { useFileSystem } from './file-system-context';

interface AgentStatus {
  loading: boolean;
  text: string;
}

export interface AgentContext {
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

interface AgentProviderProps {
  children: ReactNode;
}

export function AgentProvider({ children }: AgentProviderProps): ReactNode {
  const { controller } = useAppContext();
  const {
    cwd,
    git: { ignored },
  } = useFileSystem();
  const [messageQueue, setMessageQueue] = useState<string[]>([]);

  const [modelMessages, setModelMessages] = useState<ModelMessage[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const [status, setStatus] = useState<AgentStatus>({
    loading: false,
    text: '',
  });

  const { taskList, notifier, model, fileCache } = useMemo(() => {
    const model = geminiProvider('gemini-2.5-flash');

    return {
      taskList: new TaskList(),
      notifier: new Notifier(),
      fileCache: new FileCache(),
      model,
    };
  }, []);
  const tools = useMemo<ToolSet>(
    () => makeToolSet(toolRegistry, notifier, controller.signal),
    [notifier, controller]
  );
  const [systemPrompt, setSystemPrompt] = useState<string>(
    DEFAULT_SYSTEM_PROMPT
  );

  const [mcpServers, setMcpServers] = useState<MCP[]>([]);

  useEffect(() => {
    if (!Features.MCP) return;

    setStatus({
      text: basicHighlightFormatting('Connecting with MCP server...'),
      loading: true,
    });

    void loadMcpConfig(controller.signal)
      .then(setMcpServers)
      .then(() => setStatus({ text: '', loading: false }))
      .catch((error): MCP[] => {
        const errMsg = error instanceof Error ? error.message : String(error);
        setStatus({
          text: chalk.red(`Failed to load MCP config - ${errMsg}`),
          loading: false,
        });
        setTimeout(() => setStatus({ text: '', loading: false }), 5000);
        return [];
      });
  }, [controller.signal]);

  /**
   * System prompt construction
   */
  useEffect(() => {
    let cancelled = false;
    void constructSystemPrompt(taskList, mcpServers, { cwd, ignored }).then(
      prompt => {
        if (!cancelled) setSystemPrompt(prompt);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [taskList, mcpServers, cwd, ignored]);

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
    return eventOn(EventName.AGENT_MESSAGE, ({ detail }) => setMessage(detail));
  }, [setMessage]);

  const processRequest = useCallback(
    async (prompt: string, quiet: boolean) => {
      setStatus({ text: getRandomMessage(), loading: true });
      const interval = setInterval(() => {
        setStatus({
          text: getRandomMessage(),
          loading: true,
        });
      }, 3000);

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
        abortSignal: controller.signal,
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
        onError: ({ error }) => {
          setMessage({
            id: uuid(),
            type: 'assistant',
            content: String(error),
          });
        },
      });

      let currentTextId: string | null = null;
      let buffer = '';

      try {
        for await (const part of result.fullStream) {
          if (part.type === 'text-start') {
            currentTextId = uuid();
            buffer = '';
          } else if (part.type === 'text-delta') {
            buffer += part.text;
            if (isNonEmptyString(currentTextId)) {
              setMessage({
                type: 'assistant',
                id: currentTextId,
                content: buffer,
              });
            }
          } else if (part.type === 'text-end') {
            currentTextId = null;
          }
        }
        const response = await result.response;

        clearInterval(interval);
        setStatus({ text: '', loading: false });
        setModelMessages(prev => [...prev, ...response.messages]);
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

      /*if (taskList.hasIncompleteTasks()) {
        await processRequest(
          "Your task list is not yet finished. Proceed until you're done",
          true
        );
      }*/

      const firstQueuedMessage = messageQueue.shift();
      if (isNonEmptyString(firstQueuedMessage)) {
        await processRequest(firstQueuedMessage, false);
      }
    },
    [
      messageQueue,
      model,
      modelMessages,
      setMessage,
      controller,
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
