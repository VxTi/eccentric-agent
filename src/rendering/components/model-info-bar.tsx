import { Box, Text } from 'ink';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  getModelMetadata,
  type LanguageModelMetadata,
} from '../../lib/agent/provider';
import {
  type ConsumeTokenEvent,
  EventName,
  eventOn,
  type TokenConsumeProps,
  TokenSource,
} from '../../lib/events/events';
import {
  formatPercentageSymbol,
  formatTokenCount,
} from '../../lib/text-formatting';
import { useAgent } from '../context';

export function ModelInfoBar(): ReactNode {
  const [{ input, output }, setCount] = useState<
    Omit<TokenConsumeProps, 'source'>
  >({
    input: 0,
    output: 0,
  });
  const [{ input: extIn, output: extOut }, setExtCount] = useState<
    Omit<TokenConsumeProps, 'source'>
  >({ input: 0, output: 0 });
  const { model } = useAgent();

  useEffect(() => {
    return eventOn(
      EventName.CONSUME_TOKENS,
      ({ detail: { input, output, source, reset } }: ConsumeTokenEvent) => {
        if (reset) {
          setExtCount({ input: 0, output: 0 });
          setCount({ input: 0, output: 0 });
          return;
        }
        const updateState =
          source === TokenSource.SUB_TASK ? setExtCount : setCount;

        updateState(prev => ({
          input: prev.input + input,
          output: prev.output + output,
        }));
      }
    );
  }, []);

  const metadata: LanguageModelMetadata = useMemo(
    () => getModelMetadata(model),
    [model]
  );
  const contextWindowUsedPercentage =
    100 * ((input + output) / metadata.contextWindow);
  const cost =
    ((input + extIn) / 1_000_000) * metadata.inputTokenPricing +
    ((output + extOut) / 1_000_000) * metadata.outputTokenPricing;

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
      <Box gap={1}>
        <Box paddingRight={1} gap={2}>
          <Text underline>{model}</Text>
          <Text>${cost.toFixed(cost < 100 ? 2 : 1)}</Text>
        </Box>
        <Box>
          <Text>{formatPercentageSymbol(contextWindowUsedPercentage)} </Text>
          <Text>{contextWindowUsedPercentage.toFixed(1)}% </Text>
        </Box>
      </Box>
    </Box>
  );
}
