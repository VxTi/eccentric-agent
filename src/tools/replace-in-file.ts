import chalk from 'chalk';
import { readFile, writeFile } from 'fs/promises';
import path from 'node:path';
import * as z from 'zod';
import { acquireContextInstance } from '../rendering/context';
import { createTool } from './common';

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The path of the file to edit. May be absolute or relative to the working directory.'
    ),
  line: z
    .number()
    .int()
    .min(1)
    .describe(
      'The 1-based line number where the replacement range starts (inclusive).'
    ),
  count: z
    .number()
    .int()
    .min(1)
    .describe(
      'The number of consecutive lines to replace, starting at `line`. Must be >= 1.' +
        ' `line + count - 1` must not exceed the file length.'
    ),
  replacement: z
    .string()
    .describe(
      'The text to insert in place of the removed range. May contain multiple lines' +
        ' separated by `\\n`, or be empty to delete the range entirely. Inserted verbatim;' +
        ' a trailing `\\n` is treated as part of the block, not as a separator.'
    ),
});

const outputSchema = z.object({
  success: z.boolean(),
  bytesWritten: z.number(),
  linesRemoved: z.number(),
  linesInserted: z.number(),
  filePath: z.string(),
});

export default createTool({
  internalName: 'replace_in_file',
  name: 'Replace in file',
  description:
    'Replaces a contiguous range of lines in `filePath` with `replacement`. The range' +
    ' starts at the 1-based `line` and spans `count` lines (inclusive).\n\n' +
    'Use this tool when changing one or more consecutive lines in a file. To add new' +
    ' lines without removing existing content, use `insert_in_file` instead.\n\n' +
    'Rules:\n' +
    '  • `line` is 1-based; `count` must be >= 1.\n' +
    '  • `line + count - 1` must not exceed the file line count.\n' +
    '  • `replacement` may span multiple lines separated by `\\n`, or be empty to delete' +
    '    the range. A trailing `\\n` in `replacement` is treated as part of the block,' +
    '    not as a separator.\n' +
    "  • The file's original trailing-newline state is preserved.\n" +
    '  • If the file changed on disk since it was last read in this session, the operation' +
    '    is rejected so you can re-read and retry against fresh content.',
  inputSchema,
  outputSchema,
  mightRequireApproval: false,

  async handle({ filePath, line, count, replacement }) {
    const context = await acquireContextInstance();
    const absolutePath = await context.fileCache.getCachedFilePath(filePath);

    const original = await readFile(absolutePath, 'utf-8');
    const lines = original.length === 0 ? [] : original.split('\n');

    const hadTrailingNewline = original.endsWith('\n');
    if (hadTrailingNewline) lines.pop();

    if (line < 1 || line > lines.length) {
      throw new Error(
        `\`line\` ${line} is out of range. File has ${lines.length} line(s);` +
          ` valid range is 1..${lines.length}.`
      );
    }

    const endLine = line + count - 1;
    if (endLine > lines.length) {
      throw new Error(
        `Range \`line\` ${line} + \`count\` ${count} exceeds file length` +
          ` (${lines.length} line(s)).`
      );
    }

    const replacementLines =
      replacement.length === 0 ? [] : replacement.split('\n');
    if (
      replacementLines.length > 1 &&
      replacementLines[replacementLines.length - 1] === ''
    ) {
      replacementLines.pop();
    }

    lines.splice(line - 1, count, ...replacementLines);

    let updated = lines.join('\n');
    if ((hadTrailingNewline || original.length === 0) && lines.length > 0)
      updated += '\n';

    await writeFile(absolutePath, updated, 'utf-8');
    await context.fileCache.update(absolutePath);

    return {
      success: true,
      bytesWritten: Buffer.byteLength(updated, 'utf-8'),
      linesRemoved: count,
      linesInserted: replacementLines.length,
      filePath,
    };
  },

  inputToString({ filePath, line, count }) {
    const fileName = path.basename(filePath);
    const range =
      count === 1 ? `line ${line}` : `lines ${line}-${line + count - 1}`;
    return `Replacing ${range} in \`${fileName}\``;
  },

  outputToString({ success, linesRemoved, linesInserted, filePath }) {
    const fileName = path.basename(filePath);

    if (!success) return `Unable to update contents of ${filePath}`;

    return `Updated \`${fileName}\` ${chalk.redBright(`-${linesRemoved}`)} ${chalk.greenBright(`+${linesInserted}`)}`;
  },
});
