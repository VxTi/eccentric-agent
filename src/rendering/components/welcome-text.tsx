import { Box, Text } from 'ink';

export function WelcomingText() {
  return (
    <Box paddingTop={1} paddingBottom={8} justifyContent="center" width="100%">
      <Text bold>{`
                         _        _      
  ___  ___ ___ ___ _ __ | |_ _ __(_) ___ 
 / _ \\/ __/ __/ _ \\ '_ \\| __| '__| |/ __|
|  __/ (_| (_|  __/ | | | |_| |  | | (__ 
 \\___|\\___\\___\\___|_| |_|\\__|_|  |_|\\___|
`}</Text>
    </Box>
  );
}
