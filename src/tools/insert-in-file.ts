import * as z from 'zod';
import { readFile, writeFile } from 'fs/promises';
import { acquireContextInstance } from '../rendering/context';
import { createTool } from './common';

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The path of the file to edit. May be absolute or relative to the working directory.'
    ),
  lineNumber: z
    .number()
    .int()
    .min(0)
    .describe(
      'The 1-based line number to anchor the edit to. Interpretation depends on' +
        ' `inclusive`: when false (default), content is inserted AFTER this line' +
        ' (use 0 to insert at the top, `lineCount` to append at the end); when true,' +
        ' this line is REPLACED by `content`.'
    ),
  content: z
    .string()
    .describe(
      'The text to insert. May contain multiple lines separated by `\\n`. Inserted' +
        ' verbatim; a trailing `\\n` is treated as part of the block, not as a separator.'
    ),
  inclusive: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, `content` REPLACES the line at `lineNumber`. When false (default),' +
        ' `content` is inserted immediately AFTER `lineNumber` and nothing is overwritten.'
    ),
});

const outputSchema = z.object({
  success: z.boolean(),
  bytesWritten: z.number(),
  linesInserted: z.number(),
});

export default createTool({
  internalName: 'insert_in_file',
  name: 'Insert in file',
  description:
    'Inserts `content` into `filePath` relative to the 1-based `lineNumber`. The' +
    ' `inclusive` flag controls whether the target line is overwritten or preserved.\n\n' +
    'Modes:\n' +
    '  • `inclusive: false` (default) — insert AFTER `lineNumber`. The line at' +
    ' `lineNumber` is kept; `content` becomes the lines immediately following it.' +
    ' Pass `lineNumber: 0` to insert at the very top. Valid range:' +
    ' `[0, lineCount]`.\n' +
    '  • `inclusive: true` — REPLACE the line at `lineNumber` with `content`.' +
    ' Valid range: `[1, lineCount]`.\n\n' +
    '`content` is inserted verbatim and may span multiple lines separated by' +
    ' `\\n`. A trailing `\\n` in `content` is treated as part of the block, not as' +
    ' a separator — it will not produce a spurious blank line between the inserted' +
    " block and the following line. The file's original trailing-newline state is" +
    ' preserved.\n\n' +
    'For arbitrary text substitution use `replace_in_file`. For deletions or other' +
    ' content-based edits, read the file first and use a replace-style tool.',
  inputSchema,
  outputSchema,
  mightRequireApproval: false,

  async handle({ filePath, content, inclusive, lineNumber }) {
    const context = await acquireContextInstance();
    const absolutePath = await context.fileCache.getCachedFilePath(filePath);

    const original = await readFile(absolutePath, 'utf-8');
    const lines = original.length === 0 ? [] : original.split('\n');

    const hadTrailingNewline = original.endsWith('\n');
    // `split('\n')` on text ending in '\n' yields a trailing empty string; drop
    // it so `lines.length` equals the number of actual content lines.
    if (hadTrailingNewline) lines.pop();

    const insertLines = content.split('\n');
    // A trailing '\n' in content would otherwise inject a blank line between
    // the inserted block and the following file content.
    if (insertLines.length > 1 && insertLines[insertLines.length - 1] === '') {
      insertLines.pop();
    }

    if (inclusive) {
      if (lineNumber < 1 || lineNumber > lines.length) {
        throw new Error(
          `\`lineNumber\` ${lineNumber} is out of range for inclusive mode.` +
            ` File has ${lines.length} line(s); valid range is 1..${lines.length}.`
        );
      }
      lines.splice(lineNumber - 1, 1, ...insertLines);
    } else {
      if (lineNumber < 0 || lineNumber > lines.length) {
        throw new Error(
          `\`lineNumber\` ${lineNumber} is out of range. File has` +
            ` ${lines.length} line(s); valid range is 0..${lines.length}.`
        );
      }
      lines.splice(lineNumber, 0, ...insertLines);
    }

    let updated = lines.join('\n');
    if (hadTrailingNewline || original.length === 0) updated += '\n';

    await writeFile(absolutePath, updated, 'utf-8');
    await context.fileCache.update(absolutePath);

    return {
      success: true,
      bytesWritten: Buffer.byteLength(updated, 'utf-8'),
      linesInserted: insertLines.length,
    };
  },

  inputToString({ lineNumber, inclusive, filePath }) {
    const action = inclusive ? 'Replacing line' : 'Inserting after line';
    return `${action} ${lineNumber} in \`${filePath}\``;
  },

  outputToString({ linesInserted, success, bytesWritten }) {
    if (!success) return `Unable to insert into file`;
    return `Inserted \`${linesInserted}\` line(s) (\`${bytesWritten}\` bytes total).`;
  },
});
