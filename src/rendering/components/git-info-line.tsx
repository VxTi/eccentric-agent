import { isNil } from '@vxti/typed';
import { Box, Text } from 'ink';
import { useFileSystem } from '../context/file-system-context';

export function GitInfoLine() {
  const {
    git: { currentBranch, repoName },
    loading,
  } = useFileSystem();

  if (loading || isNil(currentBranch) || isNil(repoName)) return;

  return (
    <Box alignSelf="flex-start">
      <Text>
        {repoName} * {currentBranch}
      </Text>
    </Box>
  );
}
