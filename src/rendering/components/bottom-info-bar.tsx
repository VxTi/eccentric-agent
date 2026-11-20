import { Box, Text } from 'ink';
import { type ReactNode, useEffect, useState } from 'react';
import {
  type ConsumeTokenEvent,
  type ContextUsageEvent,
  EventName,
  eventOn,
  TokenSource,
} from '../../lib/events/events';
import { useAppSelector } from '../../lib/state';
import { formatTokenCount } from '../../lib/text-formatting';

interface Usage {
  input: number;
  output: number;
}

const ZERO: Usage = { input: 0, output: 0 };

/**
 * Two distinct token readings:
 *
 * - **ctx** — live occupancy of the primary context window (the last prompt's
 *   size and its reply), replaced each turn. Shrinks when ContextStore elides
 *   redundant file reads. Sub-agent work is excluded; it does not occupy the
 *   main window.
 * - **billed / sub** — cumulative tokens charged over the session, summed and
 *   split between the primary agent and secondary (sub-agent) work.
 */
export function BottomInfoBar(): ReactNode {
  const autoApprove = useAppSelector(state => state.agent.autoApprove);
  const [occupancy, setOccupancy] = useState<Usage>(ZERO);
  const [primary, setPrimary] = useState<Usage>(ZERO);
  const [secondary, setSecondary] = useState<Usage>(ZERO);

  useEffect(() => {
    return eventOn(
      EventName.CONSUME_TOKENS,
      ({ detail: { input, output, reset, source } }: ConsumeTokenEvent) => {
        if (reset) {
          setPrimary(ZERO);
          setSecondary(ZERO);
          return;
        }
        const add = (prev: Usage): Usage => ({
          input: prev.input + input,
          output: prev.output + output,
        });
        if (source === TokenSource.SECONDARY) setSecondary(add);
        else setPrimary(add);
      }
    );
  }, []);

  useEffect(() => {
    return eventOn(
      EventName.CONTEXT_USAGE,
      ({ detail: { input, output } }: ContextUsageEvent) => {
        setOccupancy({ input, output });
      }
    );
  }, []);

  const hasSecondary = secondary.input > 0 || secondary.output > 0;

  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      gap={1}
      width="100%"
      flexWrap="wrap"
      justifyContent="flex-start"
    >
      <Text color="gray">
        ctx ↑ {formatTokenCount(occupancy.input)} ↓{' '}
        {formatTokenCount(occupancy.output)}
      </Text>
      <Text color="gray">
        billed ↑ {formatTokenCount(primary.input)} ↓{' '}
        {formatTokenCount(primary.output)}
      </Text>
      {hasSecondary && (
        <Text color="gray">
          sub ↑ {formatTokenCount(secondary.input)} ↓{' '}
          {formatTokenCount(secondary.output)}
        </Text>
      )}
      <Text color={autoApprove ? 'yellow' : 'gray'}>
        ⏭ auto <Text dimColor>(ctrl+a)</Text>
      </Text>
    </Box>
  );
}
