import { type Output } from 'ai';
import * as path from 'node:path';
import { z } from 'zod';
import { ToolBase } from './common/tool-base';
import { glob } from 'glob';

export default class FindFileTool extends ToolBase<Input, Output> {
  constructor() {
    super(
      'find_file',
      'Find file',
      'Locates files on disk by matching their path against a glob pattern (e.g. `src/**/*.ts`,' +
        ' `**/package.json`, `lib/utils/*.{js,ts}`). Returns a list of matching file paths relative to the' +
        ' working directory. Use this tool when you need to discover *where* a file lives — by name, extension,' +
        ' or directory layout — but do NOT use it to search for content *inside* files (use `find_in_file` for' +
        ' that). Typical use cases: finding all test files, locating a configuration file by name, enumerating' +
        ' source files of a given extension, or verifying that a file exists at an expected path. ONLY invoke' +
        ' this tool when the current context does not already contain the file path you need; prefer existing' +
        ' context over repeated lookups. Only use this if no other options are available, e.g., shell commands.' +
        '\n\n' +
        'CRITICAL — translate the user request into a proper glob pattern before calling this tool. A bare' +
        ' filename or basename is NOT a valid pattern and will only match a file sitting directly in' +
        ' `directoryPath`. Follow these rules:\n' +
        '  • Bare name (e.g. user says "find file foo.ts" or "find foo") → use `**/foo.ts` so the file is' +
        '    located anywhere in the tree, not just at the root.\n' +
        '  • Name without extension or with unknown extension → expand with braces: `**/foo.{ts,tsx,js,jsx,mjs,cjs}`' +
        '    (or a similar set appropriate to the project). Do NOT guess a single extension.\n' +
        '  • Partial / fuzzy name → wrap with `*`: `**/*foo*` or `**/*foo*.{ts,tsx}`.\n' +
        '  • Directory-scoped request ("find foo in src/") → keep the scope in `directoryPath` and still use' +
        '    `**/foo.*` for the pattern; do not put the directory inside the pattern.\n' +
        '  • Specific extension only ("all yaml files") → `**/*.{yml,yaml}`.\n' +
        'Never pass a pattern equal to just the basename (`foo.ts`, `foo`) unless the user explicitly said the' +
        ' file is at the root of `directoryPath`. When unsure, prefer broader patterns with `**/` and braces' +
        ' over narrow ones — it is better to return a few extra matches than to return nothing.',
      inputSchema,
      outputSchema
    );
  }

  public override async handle(input: Input): Promise<Output> {
    const { filePattern, directoryPath, maxResults } = input;
    const cwd = path.resolve(process.cwd(), directoryPath);

    const results: string[] = await glob(filePattern, {
      cwd,
    }).then(files => files.map(file => path.join(cwd, file)));

    return {
      files: results.slice(0, maxResults),
    };
  }

  public override inputToString(input: Input): string {
    return `Looking for file pattern \`${input.filePattern}\` in \`${input.directoryPath}\``;
  }

  public override outputToString(output: Output): string {
    const { files } = output;
    if (files.length === 0) {
      return `Unable to find any files`;
    }
    return `Found \`${files.length} file${files.length === 1 ? '' : 's'}\``;
  }
}

const inputSchema = z.object({
  directoryPath: z
    .string()
    .describe('The directory path in which to search files in'),
  filePattern: z
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

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  files: z.array(z.string()).describe('A list of the files in a directory'),
});

type Output = z.infer<typeof outputSchema>;
