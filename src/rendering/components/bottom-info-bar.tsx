import { Box, Text } from 'ink';
import { type ReactNode, useEffect, useState } from 'react';

import {
  type ConsumeTokenEvent,
  EventName,
  eventOn,
  type TokenConsumeProps,
} from '../../lib/events/events';
import { useAppSelector } from '../../lib/state';
import { formatTokenCount } from '../../lib/text-formatting';
import { basicHighlightFormatting } from '../terminal-markdown-renderer/markdown-renderer';
import { Spinner } from './spinner';

const THINKING_TEXT = basicHighlightFormatting('Thinking...');

export function BottomInfoBar(): ReactNode {
  const reasoning = useAppSelector(state => state.agent.reasoning.active);
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
      {reasoning && (
        <Box flexShrink={0}>
          <Spinner loading />
          <Text>{THINKING_TEXT}</Text>
        </Box>
      )}
    </Box>
  );
}
