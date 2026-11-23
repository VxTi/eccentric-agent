import { Box, Text } from 'ink';
import { type ReactNode, useEffect, useState } from 'react';
import {
  type ContextUsageEvent,
  EventName,
  eventOn,
  type ResponseTokensEvent,
} from '../../lib/events/events';
import { useAppSelector } from '../../lib/state';
import { formatTokenCount } from '../../lib/text-formatting';

interface Occupancy {
  input: number;
  output: number;
}

const ZERO: Occupancy = { input: 0, output: 0 };

/**
 * A single metric pair:
 *
 * - **↑** — occupancy of the primary context window: the size of the prompt
 *   last sent, replaced each turn. Shrinks when ContextStore elides redundant
 *   file reads. Sub-agent work is excluded; it does not occupy the main window.
 * - **↓** — response tokens produced across the session, summed over every
 *   agent (primary and sub-agents). Reset by `/clear`.
 */
export function BottomInfoBar(): ReactNode {
  const autoApprove = useAppSelector(state => state.agent.autoApprove);
  const [occupancy, setOccupancy] = useState<Occupancy>(ZERO);
  const [responseTokens, setResponseTokens] = useState(0);

  useEffect(() => {
    return eventOn(
      EventName.RESPONSE_TOKENS,
      ({ detail: { output, reset } }: ResponseTokensEvent) => {
        setResponseTokens(prev => (reset ? 0 : prev + output));
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
        {`↑ ${formatTokenCount(occupancy.input)} ↓ ${formatTokenCount(responseTokens)}`}
      </Text>
      <Text color={autoApprove ? 'yellow' : 'gray'}>
        ⏭ auto <Text dimColor>(ctrl+a)</Text>
      </Text>
    </Box>
  );
}
