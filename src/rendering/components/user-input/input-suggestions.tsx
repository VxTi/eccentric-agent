import { type ReactNode, useMemo } from 'react';
import { Box, Text } from 'ink';
import { useUserInputField } from '../../context/user-input-context';
import { type Suggestion } from '../../hooks';

interface SuggestionsProps {
  maxSuggestions: number;
}

export function Suggestions({ maxSuggestions }: SuggestionsProps): ReactNode {
  const { suggestions, suggestionIndex } = useUserInputField();
  const state = useMemo(() => {
    if (!suggestions || suggestions.values.length === 0) return undefined;

    const { values } = suggestions;

    if (values.length <= maxSuggestions) {
      return {
        shown: values,
        itemsAfter: 0,
        itemsBefore: 0,
        offsetIndex: 0,
      };
    }

    const halfWindow = Math.floor(maxSuggestions / 2);
    const maxOffset = values.length - maxSuggestions;

    const targetOffset = suggestionIndex - halfWindow;

    const offsetIndex = Math.max(0, Math.min(maxOffset, targetOffset));
    const offsetUpperBound = offsetIndex + maxSuggestions;

    return {
      offsetIndex,
      shown: values.slice(offsetIndex, offsetUpperBound),
      itemsAfter: values.length - offsetUpperBound,
    };
  }, [suggestions, maxSuggestions, suggestionIndex]);

  if (!state) return;

  const { itemsAfter, offsetIndex, shown } = state;

  return (
    <Box flexDirection="column" paddingTop={1}>
      {suggestions && suggestions.values.length > maxSuggestions && (
        <Text color="gray">{'  ...'}</Text>
      )}
      {shown.map((suggestion, i) => (
        <SuggestionText key={i} selected={suggestionIndex === i + offsetIndex}>
          {suggestion}
        </SuggestionText>
      ))}
      <Text color="gray">
        {itemsAfter > 0 ? `+${itemsAfter} more` : '  ...'}
      </Text>
    </Box>
  );
}

interface SuggestionTextProps {
  children: Suggestion;
  selected: boolean;
}

function SuggestionText({
  children,
  selected,
}: SuggestionTextProps): ReactNode {
  return (
    <Box flexShrink={0} gap={2}>
      <Text color={selected ? 'redBright' : 'white'}>
        {selected ? '▶ ' : '  '}
        {children.value}
      </Text>
      {children.description !== undefined && (
        <Text color="gray" italic>
          {children.description}
        </Text>
      )}
    </Box>
  );
}
