import { isEmptyString, isNil, isNotNil, type Nullable } from '@vxti/typed';
import fs from 'node:fs';
import { getCommandSuggestions } from './commands';
import { store } from './state';
import { type MaybePromise } from './types/types';

// Match the '@<partial path>' token immediately before the cursor. The path
// chars include '/' so typing into a nested path keeps the suggestions open,
// and the query may be empty so a bare '@' lists everything.
const FILE_SUGGESTION_PATTERN = /(?:\s|^)@([\w./_-]*)$/;
// Match a leading '/<partial command>'. The query may be empty so a bare '/'
// lists every command, and '-' is allowed for names like 'system-prompt'.
const COMMAND_PATTERN = /^\/([\w-]*)$/;
const MAX_SHOWN_SUGGESTIONS = 200;
// The glob walks the whole tree, so results are cached briefly and reused
// across keystrokes; new or deleted files appear within this window.
const FILE_LIST_TTL_MS = 2_000;

interface FileListCache {
  key: string;
  files: Suggestion[];
  expiresAt: number;
}

let fileListCache: Nullable<FileListCache>;

export const enum SuggestionType {
  FILE = 'file',
  COMMAND = 'command',
}

export interface Suggestion {
  value: string;
  // Description shown after a suggestion, when highlighted
  description?: string;

  disabled?: boolean;
  disabledReason?: string;
}

export interface Suggestions {
  type: SuggestionType;
  values: Suggestion[];
}

export function getInputSuggestions(
  input: string,
  cursorOffset: number
): Promise<Nullable<Suggestions>> {
  const preCursorInput = input.slice(0, cursorOffset);

  return resolveInputSuggestions(
    preCursorInput,
    resolveFileSuggestions,
    resolveCommandSuggestion
  );
}

async function resolveInputSuggestions(
  preCursorInput: string,
  ...callbacks: ((
    preCursorInput: string
  ) => MaybePromise<Nullable<Suggestions>>)[]
): Promise<Nullable<Suggestions>> {
  for (const callback of callbacks) {
    const result = await callback(preCursorInput);

    if (isNotNil(result)) return result;
  }

  return undefined;
}

async function listProjectFiles(
  cwd: string,
  ignored: Set<string>
): Promise<Nullable<Suggestion[]>> {
  const key = [cwd, ...[...ignored].sort()].join('\u0000');

  if (
    isNotNil(fileListCache) &&
    fileListCache.key === key &&
    fileListCache.expiresAt > Date.now()
  ) {
    return fileListCache.files;
  }

  const files = await Array.fromAsync(
    fs.promises.glob('**/*', {
      exclude: Array.from(ignored),
      cwd,
    })
  );

  fileListCache = {
    key,
    files: files.map(value => ({ value })),
    expiresAt: Date.now() + FILE_LIST_TTL_MS,
  };

  return fileListCache.files;
}

async function resolveFileSuggestions(
  preCursorInput: string
): Promise<Nullable<Suggestions>> {
  const {
    cwd,
    git: { ignored },
  } = store.getState().fileSystem;
  const filePath = getFilePath(preCursorInput);

  if (isNil(filePath)) return;

  const files = await listProjectFiles(cwd, ignored).catch(() => undefined);

  if (isNil(files)) return;

  return {
    type: SuggestionType.FILE,
    values: filterSuggestions(files, filePath),
  };
}

function resolveCommandSuggestion(
  preCursorInput: string
): Nullable<Suggestions> {
  const command = getCommand(preCursorInput);

  if (isNil(command)) return;

  return {
    type: SuggestionType.COMMAND,
    values: filterSuggestions(getCommandSuggestions(), command),
  };
}

function getFilePath(preCursorInput: string): string | undefined {
  const matches = FILE_SUGGESTION_PATTERN.exec(preCursorInput);
  return matches?.[1];
}

function getCommand(preCursorInput: string): string | undefined {
  const matches = COMMAND_PATTERN.exec(preCursorInput);
  return matches?.[1];
}

function filterSuggestions(
  suggestions: Suggestion[],
  query: string
): Suggestion[] {
  const q = query.toLowerCase();

  if (isEmptyString(q, true)) {
    return suggestions.slice(0, MAX_SHOWN_SUGGESTIONS);
  }

  const matches: { suggestion: Suggestion; matchIndex: number }[] = [];

  for (const suggestion of suggestions) {
    const matchIndex = suggestion.value.toLowerCase().indexOf(q);

    if (matchIndex !== -1) matches.push({ suggestion, matchIndex });
  }

  return matches
    .sort((a, b) => {
      if (a.matchIndex !== b.matchIndex) return a.matchIndex - b.matchIndex;
      return a.suggestion.value.length - b.suggestion.value.length;
    })
    .map(({ suggestion }) => suggestion);
}
