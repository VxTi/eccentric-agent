import { isNonEmptyArray, isNonEmptyString } from '@vxti/typed';
import { type ReactNode, useMemo, useRef } from 'react';
import { Box, type DOMElement, Text, useBoxMetrics } from 'ink';
import { Position, ellipsize } from '../../../lib/utils/string-utils';
import { useUserInputField } from '../../context';
import { type Suggestion } from '../../hooks';

const MAX_SUGGESTION_COUNT = 14;

export function Suggestions(): ReactNode {
  const { suggestions, suggestionIndex } = useUserInputField();
  const containerRef = useRef<DOMElement>(null);
  const containerSize = useBoxMetrics(containerRef);

  const state = useMemo(() => {
    if (!isNonEmptyArray(suggestions?.values)) return undefined;

    const { values } = suggestions;

    if (values.length <= MAX_SUGGESTION_COUNT) {
      return {
        shown: values,
        itemsAfter: 0,
        itemsBefore: 0,
        offsetIndex: 0,
      };
    }

    const halfWindow = Math.floor(MAX_SUGGESTION_COUNT / 2);
    const maxOffset = values.length - MAX_SUGGESTION_COUNT;

    const targetOffset = suggestionIndex - halfWindow;

    const offsetIndex = Math.max(0, Math.min(maxOffset, targetOffset));
    const offsetUpperBound = offsetIndex + MAX_SUGGESTION_COUNT;

    return {
      offsetIndex,
      shown: values.slice(offsetIndex, offsetUpperBound),
      itemsAfter: values.length - offsetUpperBound,
    };
  }, [suggestions, suggestionIndex]);

  if (!state) return;

  const { itemsAfter, offsetIndex, shown } = state;

  return (
    <Box
      flexDirection="column"
      paddingTop={1}
      borderColor="gray"
      borderStyle="round"
      ref={containerRef}
    >
      {suggestions && suggestions.values.length > MAX_SUGGESTION_COUNT && (
        <Text color="gray">{'  ...'}</Text>
      )}
      {shown.map((suggestion, i) => (
        <SuggestionText
          key={i}
          selected={suggestionIndex === i + offsetIndex}
          containerWidth={containerSize.width}
        >
          {suggestion}
        </SuggestionText>
      ))}
      <Text color="gray">
        {itemsAfter > 0 ? `  +${itemsAfter} more` : '  ...'}
      </Text>
    </Box>
  );
}

interface SuggestionTextProps {
  children: Suggestion;
  selected: boolean;
  containerWidth: number;
}

function SuggestionText({
  children: { value, description },
  selected,
  containerWidth,
}: SuggestionTextProps): ReactNode {
  const edgeMargin = 6;
  const text = ellipsize(value, containerWidth - edgeMargin, Position.START);

  return (
    <Box flexShrink={0} gap={2}>
      <Text color={selected ? 'redBright' : 'white'}>
        {selected ? '▶ ' : '  '}
        {text}
      </Text>
      {isNonEmptyString(description, true) && (
        <Text color="gray" italic>
          {description}
        </Text>
      )}
    </Box>
  );
}
