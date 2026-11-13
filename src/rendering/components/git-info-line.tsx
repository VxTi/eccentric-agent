import { isNil } from '@vxti/typed';
import { Box, Text } from 'ink';
import { useAppSelector } from '../../lib/state';

export function GitInfoLine() {
  const {
    git: { currentBranch, repoName },
    loading,
  } = useAppSelector(state => state.fileSystem);

  if (loading || isNil(currentBranch) || isNil(repoName)) return;

  return (
    <Box alignSelf="flex-start">
      <Text>
        {repoName} * {currentBranch}
      </Text>
    </Box>
  );
}
