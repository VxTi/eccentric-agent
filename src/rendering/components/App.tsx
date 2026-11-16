import { Box } from 'ink';
import type { ReactNode } from 'react';
import { GitInfoLine } from './git-info-line';
import { LoadingStatusLine } from './loading-status-line';
import { MessageList } from './messages/message-list';
import { ModelInfoBar } from './model-info-bar';
import InputField from './user-input/input-field';

export function App(): ReactNode {
  return (
    <Box flexDirection="column" width="100%" alignItems="center">
      <Box width="100%" flexGrow={1} flexDirection="column">
        <Box
          height="100%"
          width="100%"
          paddingX={1}
          alignItems="flex-start"
          flexDirection="column"
        >
          <MessageList />
          <LoadingStatusLine />
          <GitInfoLine />
          <InputField />
          <ModelInfoBar />
        </Box>
      </Box>
    </Box>
  );
}
