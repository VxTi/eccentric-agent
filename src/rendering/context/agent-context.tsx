import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { type Agent, type ReasoningEffort } from '../../lib/agent/agent';
import { AgentEvents } from '../../lib/agent/agent-base';
import { EventName, eventOn } from '../../lib/events/events';
import { Features } from '../../lib/feaures';
import {
  useAppDispatch,
  useAppSelector,
  fetchGitInfo,
  setAutoApprove,
  setMessage,
} from '../../lib/state';
import type { Message } from '../../lib/types/messages';
import { isNonEmptyString } from '@vxti/typed';

export interface AgentContextInstance {
  agent: Agent;
  submitMessage: (input: string) => void;
  messages: Message[];
  reasoningEffort: ReasoningEffort;
  autoApprove: boolean;
  queuedMessageCount: number;
  toggleAutoApprove: () => void;
}

export const AgentContext = createContext<AgentContextInstance | undefined>(
  undefined
);

export function AgentProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const dispatch = useAppDispatch();
  const { ignored: gitIgnored } = useAppSelector(state => state.fileSystem.git);
  const agent = useAppSelector(state => state.agent.agent);
  const messages = useAppSelector(state => state.agent.messages);
  const autoApprove = useAppSelector(state => state.agent.autoApprove);

  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
    agent.reasoningEffort
  );
  const [queuedMessageCount, setQueuedMessageCount] = useState<number>(
    agent.messageQueue.remaining()
  );

  // Load the repo's gitignore set so the system prompt excludes ignored paths
  // such as node_modules, then feed it to the agent.
  useEffect(() => {
    void dispatch(fetchGitInfo());
  }, [dispatch]);

  useEffect(() => {
    agent.setGitIgnored(gitIgnored);
  }, [agent, gitIgnored]);

  // Integrate the store's agent with the UI: mirror its events into React /
  // Redux and kick off skill and MCP discovery. The agent itself is owned by
  // the store, so this provider never creates or replaces it.
  useEffect(() => {
    void agent.loadSkills();

    if (Features.MCP) void agent.loadMcpServers();

    const onMessage = (message: Message): void => {
      dispatch(setMessage(message));
    };

    const onReasoningEffortChange = (effort: ReasoningEffort): void => {
      setReasoningEffort(effort);
    };

    const onAutoModeChange = (enabled: boolean): void => {
      dispatch(setAutoApprove(enabled));
    };

    const onQueueChange = (count: number): void => {
      setQueuedMessageCount(count);
    };

    agent.on(AgentEvents.REASONING_EFFORT_CHANGE, onReasoningEffortChange);
    agent.on(AgentEvents.AUTO_MODE_CHANGE, onAutoModeChange);
    agent.on(AgentEvents.MESSAGE_QUEUE_SIZE_CHANGE, onQueueChange);
    agent.on(AgentEvents.MESSAGE_DELTA, onMessage);

    const offAgentMessage = eventOn(EventName.AGENT_MESSAGE, ({ detail }) =>
      dispatch(setMessage(detail))
    );

    return () => {
      agent.off(AgentEvents.MESSAGE_DELTA, onMessage);
      agent.off(AgentEvents.REASONING_EFFORT_CHANGE, onReasoningEffortChange);
      agent.off(AgentEvents.AUTO_MODE_CHANGE, onAutoModeChange);
      agent.off(AgentEvents.MESSAGE_QUEUE_SIZE_CHANGE, onQueueChange);
      offAgentMessage();
    };
  }, [agent, dispatch]);

  const submitMessage = useCallback(
    (input: string) => {
      if (!isNonEmptyString(input, true)) return;

      void agent.submitMessage(input);
    },
    [agent]
  );

  const toggleAutoApprove = useCallback(() => {
    agent.toggleAutoApprove();
  }, [agent]);

  const value = useMemo<AgentContextInstance>(
    () => ({
      reasoningEffort,
      agent,
      submitMessage,
      messages,
      autoApprove,
      queuedMessageCount,
      toggleAutoApprove,
    }),
    [
      reasoningEffort,
      agent,
      submitMessage,
      messages,
      autoApprove,
      queuedMessageCount,
      toggleAutoApprove,
    ]
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}
