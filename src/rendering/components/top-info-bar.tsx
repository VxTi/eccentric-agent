import { isNil } from '@vxti/typed';
import { Box, Text } from 'ink';
import { ReasoningEffort } from '../../lib/agent/agent';
import { useAppSelector } from '../../lib/state';
import { useAgent } from '../hooks';
import { QueuedMessages } from './queued-messages';

const reasoningEffortChars = ['○', '◔', '◑', '◕', '●'];

export function TopInfoBar() {
  const {
    git: { currentBranch, repoName },
    loading,
  } = useAppSelector(state => state.fileSystem);
  const {
    reasoningEffort,
    agent: { model },
  } = useAgent();

  if (loading || isNil(currentBranch) || isNil(repoName)) return;

  return (
    <Box
      alignSelf="flex-start"
      justifyContent="space-between"
      width="100%"
      paddingX={2}
    >
      <Box gap={2}>
        <QueuedMessages />
        <Box gap={1}>
          <Text color="gray">{repoName}</Text>
          <Text dimColor color="gray">
            •
          </Text>
          <Text>{currentBranch}</Text>
        </Box>
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
