import { type ReactNode, useMemo } from 'react';
import { Box, Text } from 'ink';

interface SuggestionTextProps {
  children: string;
  selected: boolean;
}

function SuggestionText({
  children,
  selected,
}: SuggestionTextProps): ReactNode {
  return (
    <Text color={selected ? 'redBright' : 'white'}>
      {selected ? '▶ ' : '  '}
      {children}
    </Text>
  );
}

interface SuggestionsProps {
  suggestions: string[];
  selectedIndex: number;
  maxSuggestions: number;
}

export function Suggestions({
  suggestions,
  selectedIndex,
  maxSuggestions,
}: SuggestionsProps): ReactNode {
  const state = useMemo(() => {
    if (suggestions.length === 0) return undefined;

    if (suggestions.length <= maxSuggestions) {
      return {
        shown: suggestions,
        itemsAfter: 0,
        itemsBefore: 0,
        offsetIndex: 0,
      };
    }

    const halfWindow = Math.floor(maxSuggestions / 2);
    const maxOffset = suggestions.length - maxSuggestions;

    const targetOffset = selectedIndex - halfWindow;

    const offsetIndex = Math.max(0, Math.min(maxOffset, targetOffset));
    const offsetUpperBound = offsetIndex + maxSuggestions;

    return {
      offsetIndex,
      shown: suggestions.slice(offsetIndex, offsetUpperBound),
      itemsAfter: suggestions.length - offsetUpperBound,
    };
  }, [suggestions, maxSuggestions, selectedIndex]);

  if (!state) return;

  const { itemsAfter, offsetIndex, shown } = state;

  return (
    <Box flexDirection="column">
      {itemsAfter === 0 && suggestions.length > maxSuggestions && (
        <Text color="gray">{'  ...'}</Text>
      )}
      {shown.map((suggestion, i) => (
        <SuggestionText key={i} selected={selectedIndex === i + offsetIndex}>
          {suggestion}
        </SuggestionText>
      ))}
      <Text color="gray">{itemsAfter > 0 ? `+${itemsAfter} more` : ' '}</Text>
    </Box>
  );
}
