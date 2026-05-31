import { Text } from 'ink';
import { type ReactNode, useEffect, useState } from 'react';
import {
  type ConsumeTokenEvent,
  EventName,
  subscribeEvent,
  unsubscribeEvent,
} from '../../lib/events/events';

export function TokenUsageCounter(): ReactNode {
  const [{ input, output }, setCount] = useState({ input: 0, output: 0 });

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
  return (
    <Text color="gray">
      ↑ {input} - ↓ {output}
    </Text>
  );
}
