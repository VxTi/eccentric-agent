import { Box, Text } from 'ink';
import { type ReactNode, useEffect, useState } from 'react';

import {
  type ConsumeTokenEvent,
  EventName,
  eventOn,
  type TokenConsumeProps,
} from '../../lib/events/events';
import { formatTokenCount } from '../../lib/text-formatting';

export function ModelInfoBar(): ReactNode {
  const [{ input, output }, setCount] = useState<
    Omit<TokenConsumeProps, 'source'>
  >({
    input: 0,
    output: 0,
  });
  useEffect(() => {
    return eventOn(
      EventName.CONSUME_TOKENS,
      ({ detail: { input, output, reset } }: ConsumeTokenEvent) => {
        if (reset) {
          setCount({ input: 0, output: 0 });
          return;
        }

        setCount(prev => ({
          input: prev.input + input,
          output: prev.output + output,
        }));
      }
    );
  }, []);

  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      gap={1}
      width="100%"
      flexWrap="wrap"
      justifyContent="space-between"
    >
      <Text color="gray">
        ↑ {formatTokenCount(input)} • ↓ {formatTokenCount(output)}
      </Text>
    </Box>
  );
}
