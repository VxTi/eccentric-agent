import { Box, Static, Text } from 'ink';
import type { ReactNode } from 'react';
import { GitInfoLine } from './git-info-line';
import { MessageList } from './messages/message-list';
import { BottomInfoBar } from './bottom-info-bar';
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
          <WelcomingText />
          <MessageList />
          {/*<LoadingStatusLine />*/}
          <GitInfoLine />
          <InputField />
          <BottomInfoBar />
        </Box>
      </Box>
    </Box>
  );
}

const staticBanner = `
                         _        _      
  ___  ___ ___ ___ _ __ | |_ _ __(_) ___ 
 / _ \\/ __/ __/ _ \\ '_ \\| __| '__| |/ __|
|  __/ (_| (_|  __/ | | | |_| |  | | (__ 
 \\___|\\___\\___\\___|_| |_|\\__|_|  |_|\\___|
`;
function WelcomingText() {
  return (
    <Static items={[staticBanner]}>
      {(item, index) => (
        <Box flexDirection="column" alignItems="center" key={index}>
          <Box paddingTop={1} paddingBottom={8}>
            <Text bold>{item}</Text>
          </Box>
        </Box>
      )}
    </Static>
  );
}
