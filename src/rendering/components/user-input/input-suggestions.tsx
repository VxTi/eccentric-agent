import {
  isEmptyString,
  isNil,
  isNonEmptyArray,
  isNonEmptyString,
} from '@vxti/typed';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box, type DOMElement, Text, useBoxMetrics, useInput } from 'ink';
import { processCommand } from '../../../lib/commands';
import {
  type Suggestion,
  SuggestionType,
} from '../../../lib/input-suggestions';
import { Position, ellipsize } from '../../../lib/utils/string-utils';
import { useUserInputField } from '../../hooks';

const MAX_SUGGESTION_COUNT = 14;

export function Suggestions(): ReactNode {
  const {
    input: { value, cursorOffset },
    setInput,
    suggestions,
    setSuggestions,
    inputRequest,
  } = useUserInputField();
  const containerRef = useRef<DOMElement>(null);
  const containerSize = useBoxMetrics(containerRef);

  const [suggestionIndex, setSuggestionIndex] = useState<number>(0);

  // Any edit to the input resets the highlighted row back to the top. A new
  // suggestion list is recomputed from the input in the context, so keying this
  // off the input (rather than the list identity) keeps them in sync.
  useEffect(() => {
    setSuggestionIndex(0);
  }, [value, cursorOffset]);

  const handlePickSuggestion = useCallback(
    (type: SuggestionType, suggestion: string) => {
      if (isEmptyString(suggestion)) return;

      switch (type) {
        case SuggestionType.FILE: {
          const beforeCursor = value.slice(0, cursorOffset);
          const afterCursor = value.slice(cursorOffset);
          // Replace the '@<partial>' token immediately before the cursor with
          // the full path rather than appending to the half-typed query.
          const tokenStart = beforeCursor.search(/@[\w./_-]*$/);
          const prefix =
            tokenStart >= 0 ? beforeCursor.slice(0, tokenStart) : beforeCursor;
          const insertion = `@${suggestion} `;

          setInput(() => ({
            value: prefix + insertion + afterCursor,
            cursorOffset: prefix.length + insertion.length,
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
    [cursorOffset, setInput, value]
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
        // Dismiss the list; it reappears when the input changes again.
        setSuggestions(undefined);
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
    {
      isActive: isNil(inputRequest) && isNonEmptyArray(suggestions?.values),
    }
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
    <Box flexDirection="column" ref={containerRef}>
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
