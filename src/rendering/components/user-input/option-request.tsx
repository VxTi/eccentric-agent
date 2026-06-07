import { Box, Text, useInput } from 'ink';
import { type ReactNode, useMemo, useState } from 'react';
import { emitEvent, EventName } from '../../../lib/events/events';
import { CHANNEL_ID_NONE } from '../../../lib/events/user-input';
import { useUserInputField } from '../../context/user-input-context';
import { parseMarkdown }     from '../../terminal-markdown-renderer/markdown-renderer';

export function InputRequest(): ReactNode {
  const { inputRequest, setInputRequest } = useUserInputField();
  const [userSelectedInputIndex, setUserSelectedInputIndex] =
    useState<number>(0);
  const [activeIndices, setActiveIndices] = useState<number[]>([]);

  const { allowMultiple, options, title } = inputRequest;

  useInput((char, key) => {
    if (!inputRequest.options.length) return;

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
    } else if (key.downArrow) {
      setUserSelectedInputIndex(
        prev => (prev + options.length + 1) % options.length
      );
    } else if (key.return || key.tab) {
      const indices =
        activeIndices.length === 0 ? [userSelectedInputIndex] : activeIndices;

      emitEvent(
        EventName.INPUT_RESPONSE,
        indices.map(idx => inputRequest.options[idx]),
        inputRequest.channelId
      );

      setInputRequest({ channelId: CHANNEL_ID_NONE, options: [] });
      setUserSelectedInputIndex(-1);
    }
  });

  const description = useMemo(() => {
    if (!inputRequest.description) return;

    const md = parseMarkdown(inputRequest.description);

    return md.split('\n').slice(0, 5).join('\n');
  }, [inputRequest.description]);

  return (
    <Box
      minWidth={60}
      width="50%"
      alignSelf="center"
      flexDirection="column"
      flexShrink={0}
      paddingBottom={2}
      borderStyle="round"
      borderColor="gray"
      borderDimColor
    >
      <Box flexDirection="column" alignItems="center">
        {title?.length && (
          <Text bold color="whiteBright">
            {title}
          </Text>
        )}
        {description?.length && <Text color="white">{description}</Text>}
      </Box>
      <Box marginTop={1} marginLeft={2} flexDirection="column">
        <Text italic color="gray">
          Press space to select one
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
      <Text color={highlighted ? 'red' : 'white'} italic={highlighted}>
        {label}
      </Text>
    </Box>
  );
}
