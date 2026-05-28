import { useCallback, useEffect, useReducer, useRef, type JSX } from 'react';
import { useApp, useInput } from 'ink';
import chalk from 'chalk';
import { useAgent } from '../context/agent-context';
import type { ApprovalOption } from '../../common/types';
import { useMessageStore } from '../context/messages';
import { InputBox } from './InputBox';

export default function UserInput(): JSX.Element {
  const runtime = useAgent();
  const messageStore = useMessageStore();
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reducer, INITIAL_FIELD);
  const stateRef = useRef(state);
  stateRef.current = state;

  const set = useCallback((patch: Partial<FieldState>) => {
    dispatch({ type: 'patch', patch });
  }, []);

  const replace = useCallback((next: FieldState) => {
    dispatch({ type: 'replace', next });
  }, []);

  // Drain prompt requests from the queue into local prompt state.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      while (!cancelled) {
        const req = await runtime.inputQueue.next();
        if (cancelled) return;
        await new Promise<void>(resolveDone => {
          set({
            prompt: {
              message: req.prompt,
              options: req.options,
              selected: 0,
              resolve: (option: string) => {
                req.resolve(option);
                resolveDone();
              },
            },
          });
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime, set]);

  const startPicker = useCallback(
    async (triggerIndex: number) => {
      const { fileSelector } = runtime;
      set({
        picker: {
          triggerIndex,
          query: '',
          matches: fileSelector.filter(''),
          selected: 0,
        },
      });
      await fileSelector.reload(runtime.cwd, false);
      const current = stateRef.current.picker;
      if (!current) return;
      set({
        picker: {
          ...current,
          matches: fileSelector.filter(current.query),
        },
      });
    },
    [runtime, set]
  );

  const refreshPickerMatches = useCallback(
    (next: FieldState): FieldState => {
      const picker = next.picker;
      if (!picker) return next;
      const query = next.buffer.slice(picker.triggerIndex + 1, next.cursor);
      const matches = runtime.fileSelector.filter(query);
      const selected =
        picker.selected >= matches.length
          ? Math.max(0, matches.length - 1)
          : picker.selected;
      return {
        ...next,
        picker: { ...picker, query, matches, selected },
      };
    },
    [runtime]
  );

  const commitPicker = useCallback((next: FieldState): FieldState => {
    const picker = next.picker;
    if (!picker) return next;
    const pick = picker.matches[picker.selected];
    if (!pick) return { ...next, picker: null };
    const before = next.buffer.slice(0, picker.triggerIndex);
    const after = next.buffer.slice(next.cursor);
    const insert = `@${pick} `;
    return {
      ...next,
      buffer: before + insert + after,
      cursor: before.length + insert.length,
      picker: null,
    };
  }, []);

  const submitBuffer = useCallback(
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
  );

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      process.exit(0);
    }

    const current = stateRef.current;

    if (current.prompt) {
      const prompt = current.prompt;
      if (key.upArrow) {
        set({
          prompt: { ...prompt, selected: Math.max(0, prompt.selected - 1) },
        });
        return;
      }
      if (key.downArrow) {
        set({
          prompt: {
            ...prompt,
            selected: Math.min(prompt.options.length - 1, prompt.selected + 1),
          },
        });
        return;
      }
      if (key.return) {
        const chosen = prompt.options[prompt.selected];
        if (!chosen) return;
        set({ prompt: null });
        prompt.resolve(chosen.option);
        return;
      }
      return;
    }

    if (current.picker) {
      const picker = current.picker;
      if (key.upArrow) {
        set({
          picker: { ...picker, selected: Math.max(0, picker.selected - 1) },
        });
        return;
      }
      if (key.downArrow) {
        const maxIdx =
          Math.min(picker.matches.length, MAX_PICKER_SUGGESTIONS) - 1;
        set({
          picker: {
            ...picker,
            selected: Math.min(maxIdx, picker.selected + 1),
          },
        });
        return;
      }
      if (key.escape) {
        set({ picker: null });
        return;
      }
      if (key.tab || (key.return && picker.matches.length)) {
        replace(commitPicker(current));
        return;
      }
    }

    if (key.return) {
      const line = current.buffer;
      replace(INITIAL_FIELD);
      submitBuffer(line);
      return;
    }

    if (key.backspace || key.delete) {
      if (current.cursor === 0) return;
      const buffer =
        current.buffer.slice(0, current.cursor - 1) +
        current.buffer.slice(current.cursor);
      const cursor = current.cursor - 1;
      let next: FieldState = { ...current, buffer, cursor };
      if (next.picker && cursor <= next.picker.triggerIndex) {
        next = { ...next, picker: null };
      } else {
        next = refreshPickerMatches(next);
      }
      replace(next);
      return;
    }

    if (key.leftArrow) {
      const cursor = Math.max(0, current.cursor - 1);
      let next: FieldState = { ...current, cursor };
      if (next.picker && cursor <= next.picker.triggerIndex) {
        next = { ...next, picker: null };
      } else {
        next = refreshPickerMatches(next);
      }
      replace(next);
      return;
    }

    if (key.rightArrow) {
      const cursor = Math.min(current.buffer.length, current.cursor + 1);
      replace(refreshPickerMatches({ ...current, cursor }));
      return;
    }

    if (key.upArrow) {
      messageStore.setOffset(messageStore.offset + 1);
      return;
    }

    if (key.downArrow) {
      messageStore.setOffset(messageStore.offset - 1);
      return;
    }

    if (input && !key.ctrl && !key.meta && input.length === 1 && input >= ' ') {
      const buffer =
        current.buffer.slice(0, current.cursor) +
        input +
        current.buffer.slice(current.cursor);
      const cursor = current.cursor + 1;
      let next: FieldState = { ...current, buffer, cursor };

      if (input === '@' && !current.picker) {
        replace(next);
        void startPicker(cursor - 1);
        return;
      }

      if (next.picker) {
        if (input === ' ') {
          next = { ...next, picker: null };
        } else {
          next = refreshPickerMatches(next);
        }
      }

      replace(next);
      return;
    }
  });

  if (state.prompt) {
    return (
      <InputBox
        state={{
          text: '',
          cursor: 0,
          prefix: chalk.yellow('? ') + state.prompt.message,
          pickerLines: buildPromptLines(state.prompt),
        }}
      />
    );
  }

  return (
    <InputBox
      state={{
        text: state.buffer,
        cursor: state.cursor,
        prefix: INPUT_PREFIX,
        pickerLines: state.picker ? buildPickerLines(state.picker) : undefined,
      }}
    />
  );
}

const INPUT_PREFIX = '> ';
const MAX_PICKER_SUGGESTIONS = 8;

interface PickerState {
  triggerIndex: number;
  query: string;
  matches: string[];
  selected: number;
}

interface PromptState {
  message: string;
  options: readonly ApprovalOption[];
  selected: number;
  resolve: (option: string) => void;
}

interface FieldState {
  buffer: string;
  cursor: number;
  picker: PickerState | null;
  prompt: PromptState | null;
}

const INITIAL_FIELD: FieldState = {
  buffer: '',
  cursor: 0,
  picker: null,
  prompt: null,
};

type Action =
  | { type: 'replace'; next: FieldState }
  | { type: 'patch'; patch: Partial<FieldState> };

function reducer(state: FieldState, action: Action): FieldState {
  switch (action.type) {
    case 'replace':
      return action.next;
    case 'patch':
      return { ...state, ...action.patch };
  }
}

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
