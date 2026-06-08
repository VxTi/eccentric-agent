import { Box, Text } from 'ink';
import { useGitInfo } from '../context/git-info';

export function GitInfoLine() {
  const { gitInfo, loading } = useGitInfo();

  if (loading || !gitInfo) return;
  return (
    <Box alignSelf="flex-start">
      <Text>
        {gitInfo.repoName} * {gitInfo.currentBranch}
      </Text>
    </Box>
  );
}
