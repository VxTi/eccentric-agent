import {
  hasArrayLengthAtLeast,
  isEmptyString,
  isNonEmptyArray,
  isNotNil,
} from '@vxti/typed';
import { glob } from 'glob';
import { useEffect, useState } from 'react';
import { SUPPORTED_COMMANDS } from '../../lib/commands';

const FILE_SUGGESTION_PATTERN = /(?:\s|^)@([\w_.-]+)$/;
const COMMAND_PATTERN = /^\/(\w*)$/;
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

export interface SuggestionSet {
  type: SuggestionType;
  values: Suggestion[];
}

export function useInputSuggestionProvider(
  input: string,
  cursorOffset: number
) {
  const [suggestions, setSuggestions] = useState<SuggestionSet | undefined>(
    undefined
  );
  const [suggestionCursorIndex, setSuggestionCursorIndex] = useState(0);

  useEffect(() => {
    const preCursorInput = input.slice(0, cursorOffset);

    let matches: RegExpExecArray | null;

    if (
      isNotNil((matches = FILE_SUGGESTION_PATTERN.exec(preCursorInput))) &&
      hasArrayLengthAtLeast(matches, 2)
    ) {
      const filePath = matches[1];

      if (filePath.length === 0) return;

      /* to exclude @ char*/
      setSuggestionCursorIndex(matches.index + 1);

      void glob('**/*', {
        nodir: true,
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
        dot: false,
        cwd: process.cwd(),
      }).then(files =>
        setSuggestions({
          type: SuggestionType.FILE,
          values: filterSuggestions(
            files.map(f => ({ value: f })),
            filePath
          ),
        })
      );
      return;
    }

    if ((matches = COMMAND_PATTERN.exec(preCursorInput)) !== null) {
      const command = matches[1];

      setSuggestions({
        type: SuggestionType.COMMAND,
        values: filterSuggestions(SUPPORTED_COMMANDS, command),
      });
      return;
    }

    if (isNonEmptyArray(suggestions?.values)) {
      setSuggestions(undefined);
      setSuggestionCursorIndex(0);
    }
  }, [cursorOffset, input, suggestions?.values]);

  return {
    suggestions,
    suggestionCursorIndex,
    setSuggestions,
  };
}

function filterSuggestions(
  suggestions: Suggestion[],
  query: string
): Suggestion[] {
  const q = query.toLowerCase();
  if (isEmptyString(q)) {
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
