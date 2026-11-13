import { isEmptyString, isNotNil } from '@vxti/typed';
import fs from 'node:fs';
import { getCommandSuggestions } from './commands';
import { store } from './state';

// Match the '@<partial path>' token immediately before the cursor. The path
// chars include '/' so typing into a nested path keeps the suggestions open,
// and the query may be empty so a bare '@' lists everything.
const FILE_SUGGESTION_PATTERN = /(?:\s|^)@([\w./_-]*)$/;
// Match a leading '/<partial command>'. The query may be empty so a bare '/'
// lists every command, and '-' is allowed for names like 'system-prompt'.
const COMMAND_PATTERN = /^\/([\w-]*)$/;
const MAX_SHOWN_SUGGESTIONS = 200;

export const enum SuggestionType {
  FILE = 'file',
  COMMAND = 'command',
}

export interface Suggestion {
  value: string;
  // Description shown after a suggestion, when highlighted
  description?: string;
}

export interface Suggestions {
  type: SuggestionType;
  values: Suggestion[];
}

export async function getInputSuggestions(
  input: string,
  cursorOffset: number
): Promise<Suggestions | undefined> {
  const {
    cwd,
    git: { ignored },
  } = store.getState().fileSystem;

  const preCursorInput = input.slice(0, cursorOffset);

  let matches: RegExpExecArray | null;

  if (
    isNotNil((matches = FILE_SUGGESTION_PATTERN.exec(preCursorInput))) &&
    isNotNil(matches[1])
  ) {
    const filePath = matches[1];

    return await Array.fromAsync(
      fs.promises.glob('**/*', {
        exclude: Array.from(ignored),
        cwd,
      })
    )
      .then(files => ({
        type: SuggestionType.FILE,
        values: filterSuggestions(
          files.map(f => ({ value: f })),
          filePath
        ),
      }))
      .catch(() => undefined);
  }

  if (
    (matches = COMMAND_PATTERN.exec(preCursorInput)) !== null &&
    isNotNil(matches[1])
  ) {
    const command = matches[1];

    return {
      type: SuggestionType.COMMAND,
      values: filterSuggestions(getCommandSuggestions(), command),
    };
  }

  return undefined;
}

function filterSuggestions(
  suggestions: Suggestion[],
  query: string
): Suggestion[] {
  const q = query.toLowerCase();
  if (isEmptyString(q, true)) {
    return suggestions.slice(0, MAX_SHOWN_SUGGESTIONS);
  }

  return suggestions
    .filter(({ value }) => value.toLowerCase().includes(q))
    .sort(({ value: a }, { value: b }) => {
      const ai = a.toLowerCase().indexOf(q);
      const bi = b.toLowerCase().indexOf(q);
      if (ai !== bi) return ai - bi;
      return a.length - b.length;
    });
}
