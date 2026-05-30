import { readFile, writeFile } from 'fs/promises';
import * as z from 'zod';
import { acquireContextInstance } from '../rendering/context';
import { createTool } from './common';

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The path of the file to edit. May be absolute or relative to the working directory.'
    ),
  find: z
    .string()
    .min(1)
    .describe(
      'The exact single line currently in the file that should be replaced. Must match the file' +
        ' content verbatim (including indentation and whitespace), must be unique within the' +
        ' file, and must NOT contain a newline character.'
    ),
  replace: z
    .string()
    .describe(
      'The single line that `find` should be replaced with. Use an empty string to blank the' +
        ' line. Must NOT contain a newline character.'
    ),
});

const outputSchema = z.object({
  success: z.boolean(),
  find: z.string(),
  replace: z.string(),
  filePath: z.string(),
});

export default createTool({
  internalName: 'replace_in_file',
  name: 'Replace in file',
  description:
    'Applies one or more single-line replacements to a file atomically. Each replacement has' +
    ' `find` (the exact single line currently in the file) and `replace` (the single line it' +
    ' should become). Neither `find` nor `replace` may contain newline characters.\n\n' +
    'Use this tool when changing one or more individual lines in a file. To add new lines' +
    ' to a file without replacing existing content, use `insert_in_file` instead.\n\n' +
    'Rules:\n' +
    '  • Each `find` must be a single line (no `\\n`) and must match EXACTLY ONCE in the file' +
    '    (whitespace and indentation included). If it appears multiple times, this tool cannot' +
    '    be used — pick a line that is unique within the file.\n' +
    '  • `replace` must be a single line (no `\\n`). Use an empty string to blank the line' +
    "    (the line's newline is preserved).\n" +
    '  • All replacements are validated up front against the original file contents; if any' +
    '    one fails, nothing is written.\n' +
    '  • Replacements are applied in order to an in-memory copy and the result is written once' +
    '    at the end, so the operation is atomic.\n' +
    '  • If the file changed on disk since it was last read in this session, the operation is' +
    '    rejected so you can re-read and retry against fresh content.',
  inputSchema,
  outputSchema,
  mightRequireApproval: false,

  async handle(input) {
    const { find, replace, filePath } = input;

    const context = await acquireContextInstance();
    const absolutePath = await context.fileCache.getCachedFilePath(filePath);

    const fileContent = await readFile(absolutePath, 'utf-8');

    const firstIdx = fileContent.indexOf(find);
    if (firstIdx === -1) {
      throw new Error(
        `\`find\` text was not found in the file. Make sure it matches exactly,` +
          ` including indentation and whitespace.\n--- find ---\n${find}`
      );
    }
    const secondIdx = fileContent.indexOf(find, firstIdx + 1);
    if (secondIdx !== -1) {
      throw new Error(
        `\`find\` text appears more than once in the file. This tool requires each` +
          ` \`find\` to be unique within the file.\n--- find ---\n${find}`
      );
    }

    const result =
      fileContent.slice(0, firstIdx) +
      replace +
      fileContent.slice(firstIdx + find.length);

    await writeFile(absolutePath, result, 'utf-8');
    await context.fileCache.update(absolutePath);

    return {
      success: true,
      bytesWritten: Buffer.byteLength(result, 'utf-8'),
      find,
      replace,
      filePath,
    };
  },

  inputToString({ filePath, find, replace }) {
    return `Replacing \`${find} with \`${replace}\` in \`${filePath}\``;
  },

  outputToString({ success, find, replace, filePath }) {
    if (!success) return `Unable to replace in file`;
    return `Replaced \`${find} with \`${replace}\` in \`${filePath}\``;
  },
});
