import { type JSX, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput, usePaste } from 'ink';
import chalk from 'chalk';
import { useAbort, useAgent } from '../../context';
import { useInputSuggestionProvider } from '../../hooks/input-suggestion-provider';

export default function InputField(): JSX.Element {
  const [cursorOffset, setCursorOffset] = useState<number>(0);
  const [input, setInput] = useState<string>('');
  const { suggestions } = useInputSuggestionProvider(input, cursorOffset);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number>(-1);
  const controller = useAbort();
  const runtime = useAgent();

  const submitMessage = useCallback(() => {}, []);

  /*  const submitBuffer = useCallback(
   (line: string) => {
   const trimmed = line.trim();
   if (!trimmed) return;
   const formatted = formatReferencedFiles(trimmed);
   messageStore.pushText(
   `${chalk.bold('you ') + chalk.dim('▸ ') + formatted}\n`
   );
   runtime.userMessageQueue.submit(formatted);
   },
   [runtime, messageStore]
   );*/

  usePaste(text => setInput(prev => prev + text));

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'c') {
      controller.abort(0);
    }

    // Suggestion handling
    if (suggestions.length > 0) {
      if (key.upArrow) {
        setSelectedSuggestion(prev => (prev + suggestions.length - 1) % suggestions.length);
        return;
      }

      if (key.downArrow) {
        setSelectedSuggestion(prev => (prev + suggestions.length + 1) % suggestions.length);
        return;
      }

      if (key.escape) {
        setSelectedSuggestion(-1);
        return;
      }

      if (key.tab || key.return) {
        if (selectedSuggestion > -1) {
          setInput(prev => prev + suggestions[selectedSuggestion]);
        }
        return;
      }
    }

    if (key.return) {
      submitMessage();
      return;
    }

    if (key.backspace || key.delete) {
      if (cursorOffset === 0) return;

      setInput(prev => prev.slice(0, cursorOffset - 1) + prev.slice(cursorOffset));
      setCursorOffset(prev => prev - 1);
      return;
    }

    if (key.leftArrow) {
      if (cursorOffset === 0) return;
      setCursorOffset(prev => prev - 1);
      return;
    }

    if (key.rightArrow) {
      if (cursorOffset > inputChar.length - 1) return;
      setCursorOffset(prev => prev + 1);
      return;
    }

    if (inputChar && !key.ctrl && !key.meta && inputChar.length === 1 && inputChar >= ' ') {
      setInput(prev => prev.slice(0, cursorOffset) + inputChar + prev.slice(cursorOffset));
      setCursorOffset(prev => prev + 1);
      return;
    }
  });

  return (
    <Box width="80%" alignSelf="center" flexDirection="column">
      {suggestions.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      <Box backgroundColor="gray" paddingY={1} paddingX={1} flexDirection="column">
        <Cursor input={input} cursorOffset={cursorOffset} />
      </Box>
    </Box>
  );
}

interface InputTextProps {
  input: string;
  cursorOffset: number;
}

function Cursor({ input, cursorOffset }: InputTextProps): ReactNode {
  const safeCursor = Math.max(0, Math.min(cursorOffset, input.length));
  const before = input.slice(0, safeCursor);
  const cursorChar = input[safeCursor] ?? ' ';
  const after = input.slice(safeCursor + 1);

  const [blinkState, setBlinkState] = useState<boolean>(false);

  useEffect(() => {
    setInterval(() => setBlinkState(prev => !prev), 500);
  }, []);

  return (
    <Text>
      {before}
      <Box borderLeftColor="white" borderLeft={blinkState}>
        {cursorChar}
      </Box>
      {after}
    </Text>
  );
}

interface SuggestionTextProps {
  suggestion: string;
  selected: number;
}

function SuggestionText({ suggestion, selected }: SuggestionTextProps): ReactNode {
  return <Text>{suggestion}</Text>;
}

const MAX_PICKER_SUGGESTIONS = 8;

function buildPromptLines(prompt: PromptState): string[] {
  return prompt.options.map((option, i) => {
    const active = i === prompt.selected;
    const marker = active ? chalk.cyan('❯ ') : '  ';
    const body = active ? chalk.cyan(option.text) : chalk.dim(option.text);
    return `${marker}${body}`;
  });
}

function buildPickerLines(picker: PickerState): string[] {
  const visible = picker.matches.slice(0, MAX_PICKER_SUGGESTIONS);
  if (visible.length === 0) return [chalk.dim('  (no matches)')];
  const lines = visible.map((match, i) => {
    const marker = i === picker.selected ? chalk.cyan('❯ ') : '  ';
    const body = i === picker.selected ? chalk.cyan(match) : chalk.dim(match);
    return `${marker}${body}`;
  });
  if (picker.matches.length > visible.length) {
    lines.push(chalk.dim(`  … ${picker.matches.length - visible.length} more`));
  }
  return lines;
}

export function formatReferencedFiles(input: string): string {
  const re = /@(\S+)/g;
  let match: RegExpExecArray | null;
  let sanitized = input;
  while ((match = re.exec(input)) !== null) {
    const path = match[1].replace(/[.,;:!?)\]]+$/, '');
    sanitized = sanitized.replace(match[0], `\`${path}\``);
  }
  return sanitized;
}
