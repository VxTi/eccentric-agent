import { glob } from 'glob';
import { useEffect, useState } from 'react';

const FILE_SUGGESTION_PATTERN = /(?:\s|^)@([\w_.-]+)$/;

export function useInputSuggestionProvider(
  input: string,
  cursorOffset: number
) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionCursorIndex, setSuggestionCursorIndex] = useState(0);

  useEffect(() => {
    if (cursorOffset === 0) return;

    const preCursorInput = input.slice(0, cursorOffset);

    const fileSuggestionMatch = FILE_SUGGESTION_PATTERN.exec(preCursorInput);
    if (fileSuggestionMatch?.[1]) {
      const filePath = fileSuggestionMatch[1];
      setSuggestionCursorIndex(
        fileSuggestionMatch.index + 1 /* to exclude @ char*/
      );

      // MARK: Fails silently
      void glob('**/*', {
        nodir: true,
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
        dot: false,
        cwd: process.cwd(),
      })
        .then(files => filterFiles(files, filePath))
        .then(files => setSuggestions(files));
    }
  }, [cursorOffset, input]);

  return {
    suggestions,
    suggestionCursorIndex,
    setSuggestions,
  };
}

function filterFiles(files: string[], query: string): string[] {
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
