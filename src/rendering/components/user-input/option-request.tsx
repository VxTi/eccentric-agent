import { Box, Text, useInput } from 'ink';
import { type ReactNode, useState } from 'react';
import { emitEvent, UserInputResponseEvent } from '../../../lib/events';
import { useUserInputField } from '../../context/user-input-context';

export function InputRequest(): ReactNode {
  const { inputRequest, setInputRequest } = useUserInputField();
  const [userSelectedInputIndex, setUserSelectedInputIndex] =
    useState<number>(0);
  const [activeIndices, setActiveIndices] = useState<number[]>([]);

  const { allowMultiple, options, description, title } = inputRequest;

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
        if (indices.length > 0 && !allowMultiple) return indices;

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
      emitEvent(
        new UserInputResponseEvent(
          inputRequest.options.filter((_, idx) => activeIndices.includes(idx))
        )
      );

      setInputRequest({ options: [] });
      setUserSelectedInputIndex(-1);
    }
  });

  return (
    <Box width="80%" alignSelf="center" flexDirection="column" flexShrink={0}>
      <Box flexDirection="column" alignItems="center">
        {title?.length && (
          <Text bold color="white">
            {title}
          </Text>
        )}
        {description?.length && <Text color="gray">{description}</Text>}
      </Box>
      <Box marginTop={1} marginLeft={2} flexDirection="column">
        <Text italic color="gray">
          Press space to select one{}
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
        {selected ? '◉' : '◯'}
      </Text>
      <Text color={highlighted ? 'red' : 'white'}> {label}</Text>
    </Box>
  );
}
