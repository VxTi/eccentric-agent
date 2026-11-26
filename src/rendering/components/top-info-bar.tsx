import { isNil } from '@vxti/typed';
import { Box, Text, useInput } from 'ink';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { ReasoningEffort } from '../../lib/agent/agent';
import { StatusFlag } from '../../lib/agent/agent-base';
import { useAppSelector } from '../../lib/state';
import { useAgent } from '../hooks';
import { QueuedMessages } from './queued-messages';

const reasoningEffortChars = ['○', '◔', '◑', '◕', '●'];

const errorFlagLabels = new Map<StatusFlag, string>([
  [StatusFlag.COMPACTING_CONTEXT_FAILED, 'context compaction failed'],
  [StatusFlag.ERROR_LOADING_SKILLS, 'skill loading failed'],
  [StatusFlag.ERROR_LOADING_MCPS, 'mcp loading failed'],
  [StatusFlag.ERROR_STREAMING, 'streaming failed'],
]);

function StatusFlags() {
  const flags = useAgentStatusFlags();
  const [expanded, setExpanded] = useState(false);

  useInput((input, key) => {
    if (key.ctrl && input === 'e') setExpanded(prev => !prev);
  });

  const activeErrors = [...errorFlagLabels].filter(
    ([flag]) => (flags & flag) !== 0
  );
  if (activeErrors.length === 0) return;

  if (!expanded) {
    return <Text color="red">⚠ {activeErrors.length} errors — ctrl+e</Text>;
  }

  return (
    <Box gap={2}>
      {activeErrors.map(([flag, label]) => (
        <Text key={flag} color="red" bold>
          ✗ {label}
        </Text>
      ))}
    </Box>
  );
}

function useAgentStatusFlags(): number {
  const { agent } = useAgent();
  const subscribe = useCallback(
    (onChange: () => void) => {
      agent.status.on('flag-change', onChange);
      return () => agent.status.off('flag-change', onChange);
    },
    [agent]
  );

  return useSyncExternalStore(subscribe, () => agent.status.flags);
}

export function TopInfoBar() {
  const {
    reasoningEffort,
    agent: { model },
  } = useAgent();

  return (
    <Box
      alignSelf="flex-start"
      justifyContent="space-between"
      width="100%"
      paddingX={2}
    >
      <Box gap={2}>
        <QueuedMessages />
        <StatusFlags />
        <GitInfo />
      </Box>
      <Box gap={1}>
        <Text color="blueBright" bold>
          {model.label}
        </Text>
        <Text dimColor color="gray">
          •
        </Text>
        <Text color="gray">
          {reasoningEffortChars[getReasoningEffortIdx(reasoningEffort)]}{' '}
          {reasoningEffort}
        </Text>
      </Box>
    </Box>
  );
}

function GitInfo() {
  const {
    git: { currentBranch, repoName },
    loading,
  } = useAppSelector(state => state.fileSystem);
  if (loading || isNil(currentBranch) || isNil(repoName)) return;

  return (
    <Box gap={1}>
      <Text color="gray">{repoName}</Text>
      <Text dimColor color="gray">
        •
      </Text>
      <Text>{currentBranch}</Text>
    </Box>
  );
}

function getReasoningEffortIdx(reasoningEffort: ReasoningEffort) {
  switch (reasoningEffort) {
    case ReasoningEffort.NONE:
      return 0;
    case ReasoningEffort.MINIMAL:
      return 1;
    case ReasoningEffort.LOW:
      return 1;
    case ReasoningEffort.MEDIUM:
      return 2;
    case ReasoningEffort.HIGH:
      return 3;
    case ReasoningEffort.EXTRA_HIGH:
      return 3;
    case ReasoningEffort.MAX:
      return 4;
  }
}
