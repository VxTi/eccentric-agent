import { z } from 'zod';
import { createTool } from '../tools';
import { glob } from 'glob';

const inputSchema = z.object({
  directoryPath: z
    .string()
    .describe('The directory path in which to search files in'),
  filePattern: z.string().describe('The file pattern for which to search for'),
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

async function handler(input: Input): Promise<Output> {
  const results = await glob(input.filePattern);

  return { files: results };
}

export default createTool(
  'find_file',
  'Find file',
  'Locates files on disk by matching their path against a glob pattern (e.g. `src/**/*.ts`,' +
    ' `**/package.json`, `lib/utils/*.{js,ts}`). Returns a list of matching file paths relative to the' +
    ' working directory. Use this tool when you need to discover *where* a file lives — by name, extension,' +
    ' or directory layout — but do NOT use it to search for content *inside* files (use `find_in_file` for' +
    ' that). Typical use cases: finding all test files, locating a configuration file by name, enumerating' +
    ' source files of a given extension, or verifying that a file exists at an expected path. ONLY invoke' +
    ' this tool when the current context does not already contain the file path you need; prefer existing' +
    ' context over repeated lookups.',
  inputSchema,
  outputSchema,
  handler
);
