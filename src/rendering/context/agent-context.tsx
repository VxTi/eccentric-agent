import { isNonEmptyString } from '@vxti/typed';
import {
  isLoopFinished,
  type ModelMessage,
  streamText,
  type ToolSet,
} from 'ai';
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
} from 'react';
import { v7 as uuid } from 'uuid';
import { getAppropriateModel, TaskComplexity } from '../../lib/agent/inference';
import { loadMcpConfig, type MCP } from '../../lib/agent/mcp/mcp';
import { getRandomMessage } from '../../lib/agent/rotating-messages';
import { discoverSkillFiles } from '../../lib/agent/skills/discovery';
import { constructSystemPrompt } from '../../lib/agent/system-prompt';
import { makeToolSet, toolRegistry } from '../../lib/agent/tools';
import { EventName, eventOn, TokenSource } from '../../lib/events/events';
import { Notifier } from '../../lib/events/notifier';
import { emitConsumeTokenEvent } from '../../lib/events/token-usage';
import { Features } from '../../lib/feaures';
import { type FileCache } from '../../lib/file-cache';
import { store, useAppDispatch, useAppSelector } from '../../lib/state';
import {
  type AgentStatus,
  dequeueMessage,
  enqueueMessage,
  setMcpServers as setMcpServersAction,
  setMessage as setMessageAction,
  setMessages as setMessagesAction,
  setModelMessages as setModelMessagesAction,
  setSkills as setSkillsAction,
  setStatus as setStatusAction,
  setSystemPrompt as setSystemPromptAction,
} from '../../lib/state/agent';
import { type TaskList } from '../../lib/tasks';
import type { Message, UserMessage } from '../../lib/types/messages';
import { basicHighlightFormatting } from '../terminal-markdown-renderer/markdown-renderer';

export type { AgentStatus };

export interface AgentContext {
  submitMessage: (input: string) => void;
  taskList: TaskList;
  fileCache: FileCache;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setModelMessages: Dispatch<SetStateAction<ModelMessage[]>>;
  status: AgentStatus;
  setStatus: Dispatch<SetStateAction<AgentStatus>>;
  mcpServers: MCP[];
  systemPrompt: string;
}

const PrimaryAgentContext = createContext<{
  submitMessage: (input: string) => void;
} | null>(null);

interface AgentProviderProps {
  children: ReactNode;
}

export function AgentProvider({ children }: AgentProviderProps): ReactNode {
  const dispatch = useAppDispatch();
  const {
    cwd,
    git: { ignored: gitIgnored },
  } = useAppSelector(state => state.fileSystem);
  const { taskList, mcpServers, skills } = useAppSelector(state => state.agent);
  const { controller } = useAppSelector(state => state.app);

  const notifier = useMemo(() => new Notifier(), []);
  const tools = useMemo<ToolSet>(
    () => makeToolSet(toolRegistry, notifier, controller.signal),
    [notifier, controller]
  );

  useEffect(() => {
    dispatch(
      setStatusAction({
        text: basicHighlightFormatting('Loading skills'),
        loading: true,
      })
    );
    discoverSkillFiles()
      .then(skills => {
        dispatch(setSkillsAction(skills));
        dispatch(
          setStatusAction({
            text: `skills: ${skills.map(s => s.name).join(', ')}`,
            loading: false,
          })
        );
      })
      .catch(() => {
        dispatch(
          setStatusAction({
            text: chalk.red(`Failed to load skills`),
            loading: false,
          })
        );
      });
    if (!Features.MCP) return;

    dispatch(
      setStatusAction({
        text: basicHighlightFormatting('Connecting with MCP server...'),
        loading: true,
      })
    );
    loadMcpConfig(controller.signal)
      .then(servers => {
        dispatch(setMcpServersAction(servers));
        dispatch(setStatusAction({ text: '', loading: false }));
      })
      .catch((error): MCP[] => {
        const errMsg = error instanceof Error ? error.message : String(error);
        dispatch(
          setStatusAction({
            text: chalk.red(`Failed to load MCP config - ${errMsg}`),
            loading: false,
          })
        );
        setTimeout(
          () => dispatch(setStatusAction({ text: '', loading: false })),
          5000
        );
        return [];
      });
  }, [controller.signal, dispatch]);

  /**
   * System prompt construction
   */
  useEffect(() => {
    let cancelled = false;
    void constructSystemPrompt(taskList, mcpServers, skills, {
      cwd,
      ignored: gitIgnored,
    }).then(prompt => {
      if (!cancelled) dispatch(setSystemPromptAction(prompt));
    });

    return () => {
      cancelled = true;
    };
  }, [taskList, mcpServers, cwd, gitIgnored, dispatch, skills]);

  /**
   * Handling incoming messages from non-react world, and token consumption
   */
  useEffect(() => {
    return eventOn(EventName.AGENT_MESSAGE, ({ detail }) => {
      dispatch(setMessageAction(detail));
    });
  }, [dispatch]);

  const processRequest = useCallback(
    async (prompt: string, quiet: boolean) => {
      dispatch(setStatusAction({ text: getRandomMessage(), loading: true }));
      const interval = setInterval(() => {
        dispatch(
          setStatusAction({
            text: getRandomMessage(),
            loading: true,
          })
        );
      }, 3000);

      const currentModelMessages = store.getState().agent.modelMessages;
      const updatedMessages: ModelMessage[] = [
        ...currentModelMessages,
        { role: 'user', content: prompt },
      ];
      dispatch(setModelMessagesAction(updatedMessages));

      if (!quiet) {
        const currentMessages = store.getState().agent.messages;
        dispatch(
          setMessagesAction([
            ...currentMessages,
            { type: 'user', id: uuid(), content: prompt } satisfies UserMessage,
          ])
        );
      }

      let currentTextId: string | null = null;
      let buffer = '';
      const currentSystemPrompt = store.getState().agent.systemPrompt;
      const result = streamText({
        allowSystemInMessages: true,
        abortSignal: controller.signal,
        model: getAppropriateModel(TaskComplexity.MEDIUM),
        messages: [
          { content: currentSystemPrompt, role: 'system' },
          ...updatedMessages,
        ],
        tools,
        onStepEnd: step => {
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
        onStepStart: () => {},
        stopWhen: isLoopFinished(),
        onError: ({ error }) => {
          dispatch(
            setMessageAction({
              id: uuid(),
              type: 'assistant',
              content: String(error),
            })
          );
          clearInterval(interval);
        },
      });

      try {
        for await (const part of result.stream) {
          if (part.type === 'text-start') {
            currentTextId = uuid();
            buffer = '';
          } else if (part.type === 'text-delta') {
            buffer += part.text;
            if (
              isNonEmptyString(currentTextId) &&
              isNonEmptyString(buffer, true)
            ) {
              dispatch(
                setMessageAction({
                  type: 'assistant',
                  id: currentTextId,
                  content: buffer,
                })
              );
            }
          } else if (part.type === 'text-end') {
            currentTextId = null;
          }
        }
        const response = (await result.finalStep).response;

        clearInterval(interval);
        dispatch(setStatusAction({ text: '', loading: false }));
        const latestModelMessages = store.getState().agent.modelMessages;
        dispatch(
          setModelMessagesAction([...latestModelMessages, ...response.messages])
        );
      } catch (err) {
        dispatch(
          setMessageAction({
            type: 'generic',
            id: uuid(),
            failure: true,
            content: `Something went wrong whilst responding: ${String(err)}`,
          })
        );
        dispatch(
          setStatusAction({ text: chalk.red('Fatal error'), loading: false })
        );
        return;
      }

      const queue = store.getState().agent.messageQueue;
      if (queue.length > 0) {
        const firstQueuedMessage = queue[0];
        dispatch(dequeueMessage());
        if (isNonEmptyString(firstQueuedMessage)) {
          await processRequest(firstQueuedMessage, false);
        }
      }
    },
    [controller, dispatch, tools]
  );

  const submitMessage = useCallback(
    (input: string) => {
      const currentStatus = store.getState().agent.status;
      if (currentStatus.loading) {
        dispatch(enqueueMessage(input));
        return;
      }
      void processRequest(input, false);
    },
    [dispatch, processRequest]
  );

  return (
    <PrimaryAgentContext.Provider value={{ submitMessage }}>
      {children}
    </PrimaryAgentContext.Provider>
  );
}

export function useAgent(): AgentContext {
  const dispatch = useAppDispatch();
  const context = useContext(PrimaryAgentContext);
  const {
    taskList,
    fileCache,
    messages,
    modelMessages: _modelMessages,
    status,
    mcpServers,
    systemPrompt,
  } = useAppSelector(state => state.agent);

  const setMessages = useCallback<Dispatch<SetStateAction<Message[]>>>(
    action => {
      const value =
        typeof action === 'function'
          ? action(store.getState().agent.messages)
          : action;
      dispatch(setMessagesAction(value));
    },
    [dispatch]
  );

  const setModelMessages = useCallback<
    Dispatch<SetStateAction<ModelMessage[]>>
  >(
    action => {
      const value =
        typeof action === 'function'
          ? action(store.getState().agent.modelMessages)
          : action;
      dispatch(setModelMessagesAction(value));
    },
    [dispatch]
  );

  const setStatus = useCallback<Dispatch<SetStateAction<AgentStatus>>>(
    action => {
      const value =
        typeof action === 'function'
          ? action(store.getState().agent.status)
          : action;
      dispatch(setStatusAction(value));
    },
    [dispatch]
  );

  const submitMessage = useCallback(
    (input: string) => {
      if (context) {
        context.submitMessage(input);
      }
    },
    [context]
  );

  return {
    submitMessage,
    taskList,
    fileCache,
    messages,
    setMessages,
    setModelMessages,
    status,
    setStatus,
    mcpServers,
    systemPrompt,
  };
}
