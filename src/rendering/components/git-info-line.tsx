import { isNil } from '@vxti/typed';
import { Box, Text } from 'ink';
import { ReasoningEffort } from '../../lib/agent/agent';
import { useAppSelector } from '../../lib/state';
import { useAgent } from '../hooks/use-agent';

const reasoningEffortChars = ['○', '◔', '◑', '◕', '●'];

export function GitInfoLine() {
  const {
    git: { currentBranch, repoName },
    loading,
  } = useAppSelector(state => state.fileSystem);
  const { reasoningEffort } = useAgent();

  if (loading || isNil(currentBranch) || isNil(repoName)) return;

  return (
    <Box
      alignSelf="flex-start"
      justifyContent="space-between"
      width="100%"
      paddingX={2}
    >
      <Box flexDirection="row" gap={1}>
        <Text color="gray">{repoName}</Text>
        <Text>•</Text>
        <Text>{currentBranch}</Text>
      </Box>
      <Text color="gray">
        {reasoningEffortChars[getReasoningEffortIdx(reasoningEffort)]}{' '}
        {reasoningEffort}
      </Text>
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
