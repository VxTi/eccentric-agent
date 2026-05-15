import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import { ToolBase } from '../tools';
import { type AgentRuntime } from '../agent-runtime';

export default class InsertInFileTool extends ToolBase<Input, Output> {
  constructor() {
    super(
      'insert_in_file',
      'Insert in file',
      'Inserts `content` into `filePath` at the given 1-based `lineNumber`. Existing' +
        ' content at and after that line is shifted down — nothing is overwritten.\n\n' +
        'Line number semantics:\n' +
        '  • `1` inserts at the very top of the file.\n' +
        '  • `N` (where the file currently has `N-1` lines) appends to the end.\n' +
        '  • Values outside `[1, lineCount + 1]` are rejected.\n\n' +
        '`content` is inserted verbatim. A trailing newline is added automatically if' +
        ' missing so that the next existing line is not joined onto the inserted block.\n\n' +
        'For replacing existing text use `replace_in_file`. For deletions or other' +
        ' content-based edits, read the file first and use a replace-style tool.',
      inputSchema,
      outputSchema
    );
  }

  public override async handle(
    input: Input,
    context: AgentRuntime
  ): Promise<Output> {
    const absolutePath = await context.fileCache.getCachedFilePath(
      input.filePath
    );

    const original = await readFile(absolutePath, 'utf-8');
    const lines = original.length === 0 ? [] : original.split('\n');

    const hadTrailingNewline = original.endsWith('\n');
    // `split('\n')` on text ending in '\n' yields a trailing empty string; drop
    // it so `lines.length` equals the number of actual content lines.
    if (hadTrailingNewline) lines.pop();

    const maxLine = lines.length + 1;
    if (input.lineNumber < 1 || input.lineNumber > maxLine) {
      throw new Error(
        `\`lineNumber\` ${input.lineNumber} is out of range. File has ${lines.length}` +
          ` line(s); valid range is 1..${maxLine}.`
      );
    }

    const insertLines = input.content.split('\n');
    const insertIndex = input.lineNumber - 1;
    lines.splice(insertIndex, 0, ...insertLines);

    let updated = lines.join('\n');
    if (hadTrailingNewline || original.length === 0) updated += '\n';

    await writeFile(absolutePath, updated, 'utf-8');
    await context.fileCache.update(absolutePath);

    return {
      success: true,
      bytesWritten: Buffer.byteLength(updated, 'utf-8'),
      linesInserted: insertLines.length,
    };
  }

  public override inputToString(input: Input): string {
    return `Inserting into \`${input.filePath}\` at line ${input.lineNumber}`;
  }

  public override outputToString(output: Output): string {
    if (!output.success) return `Unable to insert into file`;
    return `Inserted ${output.linesInserted} line(s) (${output.bytesWritten} bytes total).`;
  }
}

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The path of the file to edit. May be absolute or relative to the working directory.'
    ),
  lineNumber: z
    .number()
    .int()
    .min(1)
    .describe(
      'The 1-based line number at which to insert. Existing content at that line and' +
        ' below is shifted down. Pass `lineCount + 1` to append at the end of the file.'
    ),
  content: z
    .string()
    .describe(
      'The text to insert. May contain multiple lines separated by `\\n`. The block is' +
        ' inserted verbatim; a trailing newline is added automatically if not present.'
    ),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  success: z.boolean(),
  bytesWritten: z.number(),
  linesInserted: z.number(),
});

type Output = z.infer<typeof outputSchema>;
