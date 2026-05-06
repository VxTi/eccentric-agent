import chalk from 'chalk';
import { glob } from 'glob';
import { stdin, stdout } from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { ModelMessage } from 'ai';

const PROMPT = chalk.cyan('> ');
const MAX_SUGGESTIONS = 8;

type State = {
  buffer: string;
  cursor: number;
  picker: PickerState | null;
};

type PickerState = {
  triggerIndex: number;
  query: string;
  matches: string[];
  selected: number;
};

let files: string[] = [];
let refreshing: Promise<void> | null = null;
let lastRefresh = 0;
const REFRESH_TTL_MS = 2_000;

async function refreshFiles(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastRefresh < REFRESH_TTL_MS) return;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    files = await glob('**/*', {
      nodir: true,
      ignore: ['node_modules/**', 'dist/**', '.git/**'],
      dot: false,
    });
    lastRefresh = Date.now();
  })();
  try {
    await refreshing;
  } finally {
    refreshing = null;
  }
}

function filterFiles(query: string): string[] {
  const q = query.toLowerCase();
  if (!q) return files.slice(0, 200);
  return files
    .filter(f => f.toLowerCase().includes(q))
    .sort((a, b) => {
      const ai = a.toLowerCase().indexOf(q);
      const bi = b.toLowerCase().indexOf(q);
      if (ai !== bi) return ai - bi;
      return a.length - b.length;
    });
}

function clearLines(n: number): void {
  for (let i = 0; i < n; i++) {
    stdout.write('\x1b[2K');
    if (i < n - 1) stdout.write('\x1b[1A');
  }
  stdout.write('\r');
}

let lastRenderedLines = 1;

function render(state: State): void {
  if (lastRenderedLines > 1) {
    stdout.write(`\x1b[${lastRenderedLines - 1}B`);
  }
  clearLines(lastRenderedLines);

  stdout.write(PROMPT + state.buffer);
  let lines = 1;

  if (state.picker) {
    const { matches, selected } = state.picker;
    const visible = matches.slice(0, MAX_SUGGESTIONS);
    if (visible.length === 0) {
      stdout.write(`\n${chalk.dim('  (no matches)')}`);
      lines += 1;
    } else {
      for (let i = 0; i < visible.length; i++) {
        const marker = i === selected ? chalk.cyan('❯ ') : '  ';
        const line =
          i === selected ? chalk.cyan(visible[i]) : chalk.dim(visible[i]);
        stdout.write(`\n${marker}${line}`);
      }
      lines += visible.length;
      if (matches.length > visible.length) {
        stdout.write(
          `\n${chalk.dim(`  … ${matches.length - visible.length} more`)}`
        );
        lines += 1;
      }
    }
  }

  const cursorCol = PROMPT.replace(/\x1b\[[0-9;]*m/g, '').length + state.cursor;
  if (lines > 1) stdout.write(`\x1b[${lines - 1}A`);
  stdout.write(`\r\x1b[${cursorCol}C`);

  lastRenderedLines = lines;
}

function startPicker(state: State): void {
  state.picker = {
    triggerIndex: state.cursor - 1,
    query: '',
    matches: filterFiles(''),
    selected: 0,
  };
  void refreshFiles().then(() => {
    if (state.picker) {
      state.picker.matches = filterFiles(state.picker.query);
      render(state);
    }
  });
}

function updatePicker(state: State): void {
  if (!state.picker) return;
  const query = state.buffer.slice(state.picker.triggerIndex + 1, state.cursor);
  state.picker.query = query;
  state.picker.matches = filterFiles(query);
  if (state.picker.selected >= state.picker.matches.length) {
    state.picker.selected = Math.max(0, state.picker.matches.length - 1);
  }
}

function commitPicker(state: State): void {
  if (!state.picker) return;
  const pick = state.picker.matches[state.picker.selected];
  if (!pick) {
    state.picker = null;
    return;
  }
  const before = state.buffer.slice(0, state.picker.triggerIndex);
  const after = state.buffer.slice(state.cursor);
  const insert = `@${pick} `;
  state.buffer = before + insert + after;
  state.cursor = before.length + insert.length;
  state.picker = null;
}

function cancelPicker(state: State): void {
  state.picker = null;
}

const conversation: ModelMessage[] = [];
const MODEL_ID = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

async function handleSubmit(line: string): Promise<void> {
  stdout.write('\n');
  const trimmed = line.trim();
  if (!trimmed) return;

  if (!process.env.OPENAI_API_KEY) {
    stdout.write(
      chalk.red('OPENAI_API_KEY not set. Export key then retry.\n')
    );
    return;
  }

  conversation.push({ role: 'user', content: trimmed });

  stdout.write(chalk.green('assistant ') + chalk.dim('▸ '));

  let assistantText = '';
  try {
    const result = streamText({
      model: openai(MODEL_ID),
      messages: conversation,
    });

    for await (const chunk of result.textStream) {
      assistantText += chunk;
      stdout.write(chunk);
    }
    stdout.write('\n');
  } catch (err) {
    stdout.write('\n' + chalk.red(`stream error: ${String(err)}`) + '\n');
    conversation.pop();
    return;
  }

  conversation.push({ role: 'assistant', content: assistantText });
}

async function main(): Promise<void> {
  await refreshFiles(true);

  stdout.write(
    chalk.bold('eccentric-agent') +
      chalk.dim(' — type @ for files, Ctrl+C to exit\n')
  );

  const state: State = { buffer: '', cursor: 0, picker: null };

  if (!stdin.isTTY) {
    stdout.write(
      chalk.red('stdin not a TTY. CLI need interactive terminal.\n')
    );
    process.exit(1);
  }

  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  render(state);

  stdin.on('keypress', async (str, key) => {
    if (!key) return;

    if (key.ctrl && key.name === 'c') {
      stdout.write('\n');
      process.exit(0);
    }

    if (state.picker) {
      if (key.name === 'up') {
        state.picker.selected = Math.max(0, state.picker.selected - 1);
        render(state);
        return;
      }
      if (key.name === 'down') {
        state.picker.selected = Math.min(
          Math.min(state.picker.matches.length, MAX_SUGGESTIONS) - 1,
          state.picker.selected + 1
        );
        render(state);
        return;
      }
      if (key.name === 'escape') {
        cancelPicker(state);
        render(state);
        return;
      }
      if (
        key.name === 'tab' ||
        (key.name === 'return' && state.picker.matches.length)
      ) {
        commitPicker(state);
        render(state);
        return;
      }
    }

    if (key.name === 'return') {
      const line = state.buffer;
      state.buffer = '';
      state.cursor = 0;
      state.picker = null;
      lastRenderedLines = 1;
      await handleSubmit(line);
      render(state);
      return;
    }

    if (key.name === 'backspace') {
      if (state.cursor > 0) {
        state.buffer =
          state.buffer.slice(0, state.cursor - 1) +
          state.buffer.slice(state.cursor);
        state.cursor -= 1;
        if (state.picker && state.cursor <= state.picker.triggerIndex) {
          cancelPicker(state);
        } else {
          updatePicker(state);
        }
      }
      render(state);
      return;
    }

    if (key.name === 'left') {
      if (state.cursor > 0) state.cursor -= 1;
      if (state.picker && state.cursor <= state.picker.triggerIndex) {
        cancelPicker(state);
      } else {
        updatePicker(state);
      }
      render(state);
      return;
    }
    if (key.name === 'right') {
      if (state.cursor < state.buffer.length) state.cursor += 1;
      updatePicker(state);
      render(state);
      return;
    }
    if (key.name === 'home') {
      state.cursor = 0;
      cancelPicker(state);
      render(state);
      return;
    }
    if (key.name === 'end') {
      state.cursor = state.buffer.length;
      render(state);
      return;
    }

    if (str && !key.ctrl && !key.meta && str.length === 1 && str >= ' ') {
      state.buffer =
        state.buffer.slice(0, state.cursor) +
        str +
        state.buffer.slice(state.cursor);
      state.cursor += 1;

      if (str === '@' && !state.picker) {
        startPicker(state);
      } else if (state.picker) {
        if (str === ' ') {
          cancelPicker(state);
        } else {
          updatePicker(state);
        }
      }

      render(state);
      return;
    }
  });
}

main().catch(err => {
  stdout.write(`\n${chalk.red(String(err))}\n`);
  process.exit(1);
});
