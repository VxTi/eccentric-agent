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
  FREE_TEXT_INPUT_ID,
  type InputOption,
  type UserInputRequest,
} from '../../../lib/events/events';
import { useUserInputField } from '../../hooks';
import { parseMarkdown } from '../../terminal-markdown-renderer/markdown-renderer';

interface Props {
  request: UserInputRequest;
}

export function InputRequestDialog({ request }: Props): ReactNode {
  const { setInputRequest } = useUserInputField();
  const [userSelectedInputIndex, setUserSelectedInputIndex] =
    useState<number>(0);
  const [activeIndices, setActiveIndices] = useState<number[]>([]);
  const [textValue, setTextValue] = useState<string>('');

  const { allowMultiple, allowTextInput, options, title } = request;

  // The optional free-text row lives right after the predefined options and is
  // navigated with the same highlight index.
  const rowCount = options.length + (allowTextInput ? 1 : 0);
  const isTextInputRow =
    allowTextInput === true && userSelectedInputIndex === options.length;

  const submit = (response: NonEmptyArray<InputOption>) => {
    emitEvent(EventName.INPUT_RESPONSE, response, request.channelId);

    setInputRequest(undefined);
    setUserSelectedInputIndex(-1);
  };

  useInput((char, key) => {
    if (isTextInputRow) {
      if (key.upArrow) {
        setUserSelectedInputIndex(prev => (prev + rowCount - 1) % rowCount);
        return;
      }
      if (key.downArrow) {
        setUserSelectedInputIndex(prev => (prev + rowCount + 1) % rowCount);
        return;
      }
      if (key.return || key.tab) {
        if (isNonEmptyString(textValue)) {
          submit([
            { value: FREE_TEXT_INPUT_ID, label: textValue },
          ] as NonEmptyArray<InputOption>);
        }
        return;
      }
      if (key.backspace || key.delete) {
        setTextValue(prev => prev.slice(0, Math.max(0, prev.length - 1)));
        return;
      }
      if (!key.ctrl && !key.meta && !key.escape && char.length === 1) {
        setTextValue(prev => prev + char);
      }
      return;
    }

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
      setUserSelectedInputIndex(prev => (prev + rowCount - 1) % rowCount);
      return;
    }
    if (key.downArrow) {
      setUserSelectedInputIndex(prev => (prev + rowCount + 1) % rowCount);
      return;
    }
    if (key.return || key.tab) {
      const indices: NonEmptyArray<number> = isNonEmptyArray(activeIndices)
        ? activeIndices
        : [userSelectedInputIndex];

      submit(
        indices.map(idx => request.options[idx]) as NonEmptyArray<InputOption>
      );
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
          {allowTextInput
            ? 'Press space to select one, enter to submit, or highlight the input row to type your own'
            : 'Press space to select one and enter to submit'}
        </Text>
        {options.map((option, i) => (
          <InputOption
            key={i}
            selected={activeIndices.includes(i)}
            highlighted={userSelectedInputIndex === i}
            label={option.label}
          />
        ))}
        {allowTextInput && (
          <InputOption
            selected={false}
            highlighted={isTextInputRow}
            label={
              isNonEmptyString(textValue)
                ? `❯ ${textValue}`
                : '❯ Type your own input…'
            }
          />
        )}
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
