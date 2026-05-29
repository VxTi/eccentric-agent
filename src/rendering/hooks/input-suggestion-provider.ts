import { glob } from 'glob';
import { useCallback, useEffect, useState } from 'react';
import { useAgent } from '../context';

const FILE_SUGGESTION_PATTERN = /@(\w+)$/;

export function useInputSuggestionProvider(input: string, cursorOffset: number) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const { setMessages } = useAgent();

  useEffect(() => {
    if (cursorOffset === 0) return;

    const preCursorInput = input.slice(0, cursorOffset);

    tryMatch(FILE_SUGGESTION_PATTERN, preCursorInput, async ([,  filePath]) => {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Creating suggestions - ${filePath}` },
      ]);
      const files = await glob('**/*', {
        nodir: true,
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
        dot: false,
        cwd: process.cwd(),
      });
      const filtered = filterFiles(files, filePath);
      setSuggestions(filtered);
    });
  }, [input, cursorOffset, setMessages]);

  const recomputeSuggestions = useCallback(() => {}, []);

  return {
    suggestions,
    recomputeSuggestions,
  };
}

function tryMatch(pattern: RegExp, input: string, callback: (matches: string[]) => void): void {
  const matches = pattern.exec(input);
  if (!matches?.[0]) return;

  callback([...matches]);
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
