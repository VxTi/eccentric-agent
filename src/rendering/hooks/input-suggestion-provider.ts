import { glob } from 'glob';
import { useEffect, useState } from 'react';

export function useInputSuggestionProvider(input: string, cursorOffset: number) {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const lastCharacter = input.at(-1);

    // no input = no suggestions. Simple as that.
    if (input.length === 0 || !lastCharacter) return;

    // File suggestions
    if (lastCharacter === '@') {
      void glob('**/*', {
        nodir: true,
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
        dot: false,
        cwd: process.cwd(),
      }).then(files => setSuggestions(files));
    } else if (lastCharacter === '/') {
      // Somehow provide a list of supported commands
    }
  }, [input, cursorOffset]);

  return {
    suggestions,
  };
}
