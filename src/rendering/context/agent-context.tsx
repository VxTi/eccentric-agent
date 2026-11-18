import chalk from 'chalk';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { type Agent, type AgentStatus } from '../../lib/agent/agent';
import { emitConsumeTokenEvent } from '../../lib/events/token-usage';
import { EventName, eventOn } from '../../lib/events/events';
import { Features } from '../../lib/feaures';
import { useAppDispatch, useAppSelector, fetchGitInfo } from '../../lib/state';
import { setMessage, setReasoning } from '../../lib/state/agent';
import type { Message } from '../../lib/types/messages';
import { basicHighlightFormatting } from '../terminal-markdown-renderer/markdown-renderer';

const THINKING_TEXT = basicHighlightFormatting('Thinking...');

export interface AgentContextType {
  agent: Agent;
  submitMessage: (input: string) => void;
  messages: Message[];
  status: AgentStatus;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export function AgentProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const dispatch = useAppDispatch();
  const { ignored: gitIgnored } = useAppSelector(state => state.fileSystem.git);
  const agent = useAppSelector(state => state.agent.agent);
  const messages = useAppSelector(state => state.agent.messages);

  const [status, setStatus] = useState<AgentStatus>({
    loading: false,
    text: '',
  });

  // Load the repo's gitignore set so the system prompt excludes ignored paths
  // such as node_modules, then feed it to the agent.
  useEffect(() => {
    void dispatch(fetchGitInfo());
  }, [dispatch]);

  useEffect(() => {
    agent.setGitIgnore(gitIgnored);
  }, [agent, gitIgnored]);

  // Integrate the store's agent with the UI: mirror its events into React /
  // Redux and kick off skill and MCP discovery. The agent itself is owned by
  // the store, so this provider never creates or replaces it.
  useEffect(() => {
    void agent.loadSkills();

    if (Features.MCP) {
      setStatus({
        loading: true,
        text: basicHighlightFormatting('Connecting with MCP server...'),
      });
      void agent.loadMcpServers().then(ok => {
        if (ok) {
          setStatus({ text: '', loading: false });
          return;
        }
        setStatus({
          text: chalk.red('Failed to load MCP config'),
          loading: false,
        });
        setTimeout(() => setStatus({ text: '', loading: false }), 5000);
      });
    }

    const onMessage = (message: Message): void => {
      dispatch(setMessage(message));
    };
    const onStatus = (next: AgentStatus): void => setStatus(next);
    const onTokens = emitConsumeTokenEvent;

    agent.on('message-delta', onMessage);
    agent.on('status-change', onStatus);
    agent.on('tokens-consumed', onTokens);

    // Tool output, reasoning and command feedback are emitted onto the global
    // event bus rather than through the agent instance, so mirror those too.
    const offAgentMessage = eventOn(EventName.AGENT_MESSAGE, ({ detail }) =>
      dispatch(setMessage(detail))
    );

    // Reasoning reaches the UI as a start/end flag rather than as status text,
    // so fold it into the status line: a fixed indicator while the model thinks,
    // and back to whatever the agent last reported once it stops.
    const offReasoning = eventOn(EventName.AGENT_REASONING, ({ detail }) => {
      dispatch(setReasoning(detail));
      setStatus(prev =>
        detail.active
          ? { loading: true, text: THINKING_TEXT }
          : { ...prev, text: '' }
      );
    });

    return () => {
      agent.off('message-delta', onMessage);
      agent.off('status-change', onStatus);
      agent.off('tokens-consumed', onTokens);
      offAgentMessage();
      offReasoning();
    };
  }, [agent, dispatch]);

  const submitMessage = useCallback(
    (input: string) => {
      void agent.submitMessage(input);
    },
    [agent]
  );

  const value = useMemo<AgentContextType>(
    () => ({ agent, submitMessage, messages, status }),
    [agent, submitMessage, messages, status]
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

export function useAgent(): AgentContextType {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}
