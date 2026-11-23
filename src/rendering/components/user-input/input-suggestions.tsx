import {
  isNil,
  isNonEmptyArray,
  isNonEmptyString,
  isNotNil,
} from '@vxti/typed';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Box,
  type DOMElement,
  measureElement,
  Text,
  useBoxMetrics,
  useInput,
} from 'ink';
import { processCommand } from '../../../lib/commands';
import {
  type Suggestion,
  SuggestionType,
} from '../../../lib/input-suggestions';
import { Position, ellipsize } from '../../../lib/utils/string-utils';
import {
  useMouse,
  usePointerFocus,
  useScroll,
  useInputArea,
} from '../../hooks';

const MAX_SUGGESTION_COUNT = 14;
// Breathing room between the suggestion list and the right edge of the
// container, subtracted when sizing the command/description columns.
const EDGE_MARGIN = 6;
// Horizontal gap between the command and description columns (Box `gap`).
const COLUMN_GAP = 2;
// Match the '@<partial path>' token immediately before the cursor, so picking
// a file replaces the token instead of appending to the half-typed query.
const FILE_TOKEN_PATTERN = /@[\w./_-]*$/;

interface SuggestionWindowState {
  offsetIndex: number;
  shown: Suggestion[];
  itemsAfter: number;
  commandWidth: number;
}

export function InputSuggestions(): ReactNode {
  const {
    input: { value, cursorOffset },
    setInput,
    suggestions,
    setSuggestions,
    inputRequest,
  } = useInputArea();
  const containerRef = useRef<DOMElement>(null);
  const containerSize = useBoxMetrics(containerRef);

  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const maxWidth = containerSize.width - EDGE_MARGIN;

  // Any edit to the input resets the highlighted row back to the top. A new
  // suggestion list is recomputed from the input in the context, so keying this
  // off the input (rather than the list identity) keeps them in sync.
  useEffect(() => {
    setSuggestionIndex(0);
  }, [value, cursorOffset]);

  const handlePickSuggestion = useCallback(
    (type: SuggestionType, suggestion: string) => {
      switch (type) {
        case SuggestionType.FILE: {
          const beforeCursor = value.slice(0, cursorOffset);
          const afterCursor = value.slice(cursorOffset);
          const tokenStart = FILE_TOKEN_PATTERN.exec(beforeCursor)?.index ?? -1;
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

      if (!key.tab && !key.return) return;

      const suggestion = values[suggestionIndex];
      if (isNil(suggestion) || suggestion.disabled) return;

      handlePickSuggestion(suggestions.type, suggestion.value);
    },
    {
      isActive: isNil(inputRequest) && isNonEmptyArray(suggestions?.values),
    }
  );

  const state = useMemo<SuggestionWindowState | undefined>(() => {
    if (!isNonEmptyArray(suggestions?.values)) return undefined;

    const { values } = suggestions;
    const halfWindow = Math.floor(MAX_SUGGESTION_COUNT / 2);
    const maxOffset = values.length - MAX_SUGGESTION_COUNT;

    // With fewer entries than the window, maxOffset is negative and the clamp
    // collapses to a full list from the top.
    const offsetIndex = Math.max(
      0,
      Math.min(maxOffset, suggestionIndex - halfWindow)
    );
    const offsetUpperBound = offsetIndex + MAX_SUGGESTION_COUNT;
    const shown = values.slice(offsetIndex, offsetUpperBound);

    return {
      offsetIndex,
      shown,
      itemsAfter: Math.max(0, values.length - offsetUpperBound),
      commandWidth: Math.max(
        ...shown.map(
          ({ value }) => ellipsize(value, maxWidth, Position.END).length
        )
      ),
    };
  }, [suggestions, suggestionIndex, maxWidth]);

  // Hovering a row selects it; pressing the left button on a row submits it,
  // mirroring Tab/Return. Rows are one line tall, so the report's viewport row
  // minus the container's top (live-region coordinates; the live region starts
  // at viewport row 0 in alternate-screen mode) is the row under the pointer.
  useMouse(
    event => {
      if (!state || isNotNil(inputRequest) || !suggestions?.values) return;

      const { type, values } = suggestions;
      const container = containerRef.current;
      if (!container) return;

      const rowIndex = event.y - measureElement(container).y;
      if (rowIndex < 0 || rowIndex >= state.shown.length) return;

      if (event.kind === 'move') {
        setSuggestionIndex(state.offsetIndex + rowIndex);
        return;
      }
      if (event.kind !== 'down' || event.button !== 0) return;

      const suggestion = values[state.offsetIndex + rowIndex];
      if (isNil(suggestion) || suggestion.disabled) return;
      const picked = suggestion.value;

      handlePickSuggestion(type, picked);
    },
    [state, suggestions, inputRequest, handlePickSuggestion]
  );
  // Wheel scrolling steps the highlight like the arrow keys. The lib reports
  // wheel up as 1, so the delta is negated to move the selection with the wheel.
  const containerFocussed = usePointerFocus(containerRef);

  useScroll(
    ({ direction }) => {
      if (isNotNil(inputRequest) || !isNonEmptyArray(suggestions?.values))
        return;

      if (!containerFocussed) return;
      const { length } = suggestions.values;

      setSuggestionIndex(prev => (prev + length - direction) % length);
    },
    [suggestions, inputRequest]
  );

  if (!state) return;

  const { itemsAfter, offsetIndex, shown } = state;

  return (
    <Box flexDirection="column" ref={containerRef}>
      {shown.map((suggestion, i) => (
        <SuggestionText
          key={i}
          selected={suggestionIndex === i + offsetIndex}
          commandWidth={state.commandWidth}
          maxWidth={maxWidth}
          disabled={suggestion.disabled}
          disabledReason={suggestion.disabledReason}
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
  commandWidth: number;
  maxWidth: number;
  disabled?: boolean;
  disabledReason?: string | undefined;
}

function SuggestionText({
  children: { value, description },
  selected,
  commandWidth,
  maxWidth,
  disabled,
  disabledReason,
}: SuggestionTextProps): ReactNode {
  const suggestion = ellipsize(value, maxWidth, Position.START).padEnd(
    commandWidth
  );
  const descriptionWidth = maxWidth - commandWidth - COLUMN_GAP;
  const color = disabled ? 'gray' : selected ? 'redBright' : 'white';

  return (
    <Box flexShrink={0} gap={COLUMN_GAP}>
      <Text color={color}>
        {selected ? '▶ ' : '  '}
        {suggestion}
      </Text>
      {isNonEmptyString(description, true) && descriptionWidth > 0 && (
        <Text color="gray" italic>
          {ellipsize(
            disabledReason ?? description,
            descriptionWidth,
            Position.END
          )}
        </Text>
      )}
    </Box>
  );
}
