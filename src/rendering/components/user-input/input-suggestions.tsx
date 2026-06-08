import { type ReactNode, useMemo, useRef } from 'react';
import { Box, type DOMElement, Text, useBoxMetrics } from 'ink';
import { Ellipsize, ellipsize } from '../../../lib/utils/string-utils';
import { useUserInputField } from '../../context/user-input-context';
import { type Suggestion } from '../../hooks';
import { useTerminalSize } from '../../hooks/terminal-size';

interface SuggestionsProps {
  maxSuggestions: number;
}

export function Suggestions({ maxSuggestions }: SuggestionsProps): ReactNode {
  const { suggestions, suggestionIndex } = useUserInputField();
  const containerRef = useRef<DOMElement>(null);
  const containerSize = useBoxMetrics(containerRef);

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
    <Box
      flexDirection="column"
      paddingTop={1}
      borderColor="gray"
      borderStyle="round"
      ref={containerRef}
    >
      {suggestions && suggestions.values.length > maxSuggestions && (
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
  children,
  selected,
  containerWidth,
}: SuggestionTextProps): ReactNode {
  const { width } = useTerminalSize();

  const edgeMargin = 6;
  const text = ellipsize(
    children.value,
    containerWidth - edgeMargin,
    Ellipsize.START
  );

  return (
    <Box flexShrink={0} gap={2}>
      <Text color={selected ? 'redBright' : 'white'}>
        {selected ? '▶ ' : '  '}
        {text}
      </Text>
      {children.description !== undefined && width > 100 && (
        <Text color="gray" italic>
          {children.description}
        </Text>
      )}
    </Box>
  );
}
