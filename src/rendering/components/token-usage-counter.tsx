import { Box, Text } from 'ink';
import { type ReactNode, useEffect, useState } from 'react';
import {
  getModelMetadata,
  type LanguageModelMetadata,
} from '../../lib/agent/provider';
import {
  type ConsumeTokenEvent,
  EventName,
  subscribeEvent,
  unsubscribeEvent,
} from '../../lib/events/events';
import { formatTokenCount } from '../../lib/text-formatting';
import { useAgent } from '../context';

export function TokenUsageCounter(): ReactNode {
  const [{ input, output }, setCount] = useState({ input: 0, output: 0 });
  const { model } = useAgent();

  useEffect(() => {
    const handleTokenConsumption = ({
      detail: { input, output },
    }: ConsumeTokenEvent) => {
      setCount(prev => ({
        input: prev.input + input,
        output: prev.output + output,
      }));
    };
    subscribeEvent(EventName.CONSUME_TOKENS, handleTokenConsumption);
    return () => {
      unsubscribeEvent(EventName.CONSUME_TOKENS, handleTokenConsumption);
    };
  }, []);

  const metadata: LanguageModelMetadata = getModelMetadata(model);
  const contextWindowUsedPercentage =
    100 * ((input + output) / metadata.contextWindow);
  const cost =
    (input / 1_000_000) * metadata.inputTokenPricing +
    (output / 1_000_000) * metadata.outputTokenPricing;

  return (
    <Box flexDirection="row" flexShrink={0} gap={1}>
      <Text color="gray">
        ↑ {formatTokenCount(input)} - ↓ {formatTokenCount(output)}
      </Text>
      <Text>{contextWindowUsedPercentage.toFixed(1)}%</Text>
      <Text>${cost.toFixed(1)}</Text>
    </Box>
  );
}
