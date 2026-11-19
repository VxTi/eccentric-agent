import { isNil } from '@vxti/typed';
import { Box, Text } from 'ink';
import { useAppSelector } from '../../lib/state';
import { useAgent } from '../hooks/use-agent';

export function GitInfoLine() {
  const {
    git: { currentBranch, repoName },
    loading,
  } = useAppSelector(state => state.fileSystem);
  const { reasoningEffort } = useAgent();

  if (loading || isNil(currentBranch) || isNil(repoName)) return;

  return (
    <Box alignSelf="flex-start">
      <Text>
        {repoName} • {currentBranch}
      </Text>
      <Text>{reasoningEffort}</Text>
    </Box>
  );
}
