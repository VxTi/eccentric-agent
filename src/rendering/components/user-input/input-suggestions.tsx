import { isNonEmptyArray, isNonEmptyString, isNotNil } from '@vxti/typed';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Box, type DOMElement, Text, useBoxMetrics, useInput } from 'ink';
import {
  type Suggestion,
  SuggestionType,
} from '../../../lib/input-suggestions';
import { Position, ellipsize } from '../../../lib/utils/string-utils';
import { useUserInputField } from '../../context';
import { useCommandProcessor } from '../../hooks';

const MAX_SUGGESTION_COUNT = 14;

export function Suggestions(): ReactNode {
  const {
    input: { value, cursorOffset },
    setInput,
    suggestions,
    inputRequest,
  } = useUserInputField();
  const containerRef = useRef<DOMElement>(null);
  const containerSize = useBoxMetrics(containerRef);

  const [suggestionIndex, setSuggestionIndex] = useState<number>(0);
  const { processCommand } = useCommandProcessor();

  const handlePickSuggestion = useCallback(
    (type: SuggestionType, suggestion: string) => {
      switch (type) {
        case SuggestionType.FILE: {
          const beforeCursor = value.slice(0, cursorOffset);
          const afterCursor = value.slice(cursorOffset);
          setInput(() => ({
            value: beforeCursor + suggestion + afterCursor,
            cursorOffset: cursorOffset + suggestion.length + 1,
          }));
          break;
        }
        case SuggestionType.COMMAND: {
          setInput({ value: '', cursorOffset: 0 });
          processCommand(suggestion);
          break;
        }
      }
    },
    [cursorOffset, processCommand, setInput, value]
  );

  useInput(
    (_, key) => {
      if (!isNonEmptyArray(suggestions?.values)) return;
      const { values } = suggestions;
      const direction = key.upArrow ? -1 : key.downArrow ? 1 : 0;

      if (direction !== 0) {
        setSuggestionIndex(
          prev => (prev + values.length + direction) % values.length
        );

        return;
      }

      if (key.escape) {
        // Do something??
        return;
      }

      if (key.tab || key.return) {
        handlePickSuggestion(
          suggestions.type,
          values[suggestionIndex]?.value ?? ''
        );
        return;
      }
    },
    { isActive: isNotNil(inputRequest) }
  );

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
