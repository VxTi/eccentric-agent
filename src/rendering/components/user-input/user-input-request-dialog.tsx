import {
  isNonEmptyArray,
  isNonEmptyString,
  type NonEmptyArray,
} from '@vxti/typed';
import { Box, Text, useInput } from 'ink';
import { type ReactNode, useMemo, useState } from 'react';
import {
  emitEvent,
  EventName,
  type InputOption,
  type UserInputRequest,
} from '../../../lib/events/events';
import { useUserInputField } from '../../hooks';
import { parseMarkdown } from '../../terminal-markdown-renderer/markdown-renderer';

export function InputRequest({
  request,
}: {
  request: UserInputRequest;
}): ReactNode {
  const { setInputRequest } = useUserInputField();
  const [userSelectedInputIndex, setUserSelectedInputIndex] =
    useState<number>(0);
  const [activeIndices, setActiveIndices] = useState<number[]>([]);

  const { allowMultiple, options, title } = request;

  useInput((char, key) => {
    if (char === ' ') {
      setActiveIndices(indices => {
        // If selected,
        if (indices.some(selectedIdx => selectedIdx === userSelectedInputIndex))
          // Clear from selection
          return indices.filter(idx => idx !== userSelectedInputIndex);

        // If multiselect is disabled and we already have a selection
        // (and it's not the current one), exit
        if (indices.length > 0 && !allowMultiple) {
          return [userSelectedInputIndex];
        }

        // Otherwise append
        return [...indices, userSelectedInputIndex];
      });
      return;
    }

    if (key.upArrow) {
      setUserSelectedInputIndex(
        prev => (prev + options.length - 1) % options.length
      );
      return;
    }
    if (key.downArrow) {
      setUserSelectedInputIndex(
        prev => (prev + options.length + 1) % options.length
      );
      return;
    }
    if (key.return || key.tab) {
      const indices: NonEmptyArray<number> = isNonEmptyArray(activeIndices)
        ? activeIndices
        : [userSelectedInputIndex];

      emitEvent(
        EventName.INPUT_RESPONSE,
        indices.map(idx => request.options[idx]) as NonEmptyArray<InputOption>,
        request.channelId
      );

      setInputRequest(undefined);
      setUserSelectedInputIndex(-1);
    }
  });

  const description = useMemo(() => {
    if (!isNonEmptyString(request.description)) return;

    const md = parseMarkdown(request.description);

    return md.split('\n').slice(0, 5).join('\n');
  }, [request.description]);

  return (
    <Box
      width="100%"
      flexDirection="column"
      flexShrink={0}
      paddingBottom={2}
      borderLeft={false}
      borderRight={false}
      borderBottom={false}
      borderStyle="round"
      borderColor="gray"
      borderDimColor
    >
      <Box flexDirection="column">
        {isNonEmptyString(title) && (
          <Text bold color="whiteBright">
            {title}
          </Text>
        )}
        {isNonEmptyString(description) && (
          <Text color="white">{description}</Text>
        )}
      </Box>
      <Box marginTop={1} marginLeft={1} flexDirection="column">
        <Text italic color="gray">
          Press space to select one and enter to submit
        </Text>
        {options.map((option, i) => (
          <InputOption
            key={i}
            selected={activeIndices.includes(i)}
            highlighted={userSelectedInputIndex === i}
            label={option.label}
          />
        ))}
      </Box>
    </Box>
  );
}

function InputOption({
  highlighted,
  selected,
  label,
}: {
  highlighted: boolean;
  selected: boolean;
  label: string;
}) {
  return (
    <Box>
      <Text color={selected ? 'redBright' : 'white'}>
        {selected ? '◉' : '◯'}{' '}
      </Text>
      <Text
        color={highlighted ? 'red' : 'white'}
        underline={highlighted}
        italic={highlighted}
      >
        {label}
      </Text>
    </Box>
  );
}
