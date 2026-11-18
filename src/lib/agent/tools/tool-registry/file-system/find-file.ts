import { hasArrayLength } from '@vxti/typed';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as z from 'zod';
import { Result } from '../../../../result';
import { ellipsize, Position } from '../../../../utils/string-utils';
import { createTool } from '../../tool-definition';

const MAX_SHOWN_FILE_COUNT = 4;

const inputSchema = z.object({
  directoryPath: z
    .string()
    .describe('The directory path in which to search files in'),
  pattern: z
    .string()
    .describe(
      'A glob pattern (NOT a bare filename) used to match file paths under `directoryPath`. Must use glob' +
        ' syntax: `**/` for recursive descent, `*` for wildcard, `{a,b,c}` for alternatives. Examples:' +
        ' `**/foo.ts` (file named foo.ts anywhere in the tree), `**/foo.{ts,tsx,js}` (foo with any of these' +
        ' extensions), `**/*foo*` (any file whose name contains "foo"), `src/**/*.test.ts` (test files under' +
        ' src). A pattern like `foo.ts` on its own only matches a file literally at the root of' +
        ' `directoryPath` and will almost always return nothing — prefix with `**/` instead.'
    ),
  maxResults: z
    .number()
    .optional()
    .describe(
      'The max results for which to search for. This is not required, and when omitted will return any' +
        ' number of results.'
    ),
});

const outputSchema = z.object({
  files: z.array(z.string().describe('An absolute file path')),
});

export const findFile = createTool({
  internalName: 'find_file',
  name: 'Find file',
  description:
    'Find files on disk by matching their path against a glob: `src/**/*.ts`, `**/package.json`,' +
    ' `lib/utils/*.{js,ts}`. Paths back, relative to working dir.\n' +
    'What is it for? *Where* a file lives. By name. By extension. By layout. Typical jobs: every' +
    ' test file, one config file by name, every source file of one extension, proof a path exists.' +
    ' What is it NOT for? Text *inside* files. That is `find_in_file`.\n' +
    'Rule: invoke ONLY when the path is not in context. Already in context? Do not look again.' +
    ' Last resort. Reach for it when nothing else fits.\n' +
    '\n' +
    'CRITICAL — turn the request into a real glob before calling. A bare name is NOT a valid' +
    ' pattern. It matches one file sitting directly in `directoryPath`. The rules:\n' +
    '  • Bare name — "find file foo.ts", "find foo". Use `**/foo.ts`. Then it searches the whole' +
    ' tree, not just the root.\n' +
    '  • No extension, or extension unknown. Expand with braces:' +
    ' `**/foo.{ts,tsx,js,jsx,mjs,cjs}`. Pick the set that fits the project. Do NOT guess one' +
    ' extension.\n' +
    '  • Partial or fuzzy name. Wrap with `*`: `**/*foo*`, `**/*foo*.{ts,tsx}`.\n' +
    '  • Scope given — "find foo in src/". Put the scope in `directoryPath`. Keep the pattern' +
    ' `**/foo.*`. Do not put the dir inside the pattern.\n' +
    '  • Extension only — "all yaml files". Use `**/*.{yml,yaml}`.\n' +
    'Never pass a bare basename — `foo.ts`, `foo` — unless the user said the file sits at the root' +
    ' of `directoryPath`. Unsure? Go broader. `**/`. Braces. Extra matches beat no matches.',
  inputSchema,
  outputSchema,

  async handle({ pattern, directoryPath, maxResults }) {
    const cwd = path.resolve(process.cwd(), directoryPath);

    const files = await Array.fromAsync(fs.promises.glob(pattern, { cwd }));
    const results: string[] = files.slice(0, maxResults);

    return Result.Ok({ files: results }, { pattern });
  },

  inputToString: ({ pattern, directoryPath }) =>
    `Looking for file pattern \`${pattern}\` in \`${directoryPath}\``,

  outputToString({ files }, _, { pattern }): string {
    if (hasArrayLength(files, 0)) {
      return `No files found with name matching pattern \`${pattern}\``;
    }

    const limitVisibleFiles = files.length > MAX_SHOWN_FILE_COUNT;

    const shownFiles = limitVisibleFiles
      ? files.slice(0, MAX_SHOWN_FILE_COUNT)
      : files;

    const formattedFiles = shownFiles
      .map(file => `- **${ellipsize(file, 40, Position.MIDDLE)}**`)
      .join('\n');
    return `Found ${files.length} file${files.length !== 1 ? 's' : ''} matching ${pattern}:\n\n${formattedFiles}${
      limitVisibleFiles
        ? `
... and ${files.length - MAX_SHOWN_FILE_COUNT} more`
        : ''
    }`;
  },
});
