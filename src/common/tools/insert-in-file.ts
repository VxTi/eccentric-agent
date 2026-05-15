import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import { ToolBase } from '../tools';
import { type AgentContext } from '../agent-context';

export default class InsertInFileTool extends ToolBase<Input, Output> {
  constructor() {
    super(
      'insert_in_file',
      'Insert in file',
      'Applies a single string-based edit to a file. The edit has `find` (the exact text' +
        ' currently in the file) and `replace` (the text it should become). The tool finds the' +
        ' unique occurrence of `find` and substitutes `replace` for it.\n\n' +
        'Use this tool for multi-line inserts, deletions, or replacements. For changing one or' +
        ' more individual single lines, prefer `replace_in_file`.\n\n' +
        'Usage patterns:\n' +
        '  • Replace: `find` is the existing text, `replace` is the new text.\n' +
        '  • Insert before a fragment: set `find` to that fragment and `replace` to' +
        '    `"<new content>\\n<find>"`.\n' +
        '  • Insert after a fragment: `replace` to `"<find>\\n<new content>"`.\n' +
        '  • Delete: pass an empty string for `replace`.\n\n' +
        'Rules:\n' +
        '  • `find` must match EXACTLY ONCE in the file (whitespace and indentation included). If' +
        '    it appears multiple times, extend it with surrounding context until it is unique. If' +
        '    it does not appear at all, the edit is rejected.\n' +
        '  • If the file changed on disk since it was last read in this session, the operation is' +
        '    rejected so you can re-read and retry against fresh content.',
      inputSchema,
      outputSchema
    );
  }

  public override async handle(
    input: Input,
    context: AgentContext
  ): Promise<Output> {
    const absolutePath = await context.fileCache.getCachedFilePath(
      input.filePath
    );

    const original = await readFile(absolutePath, 'utf-8');

    if (input.find.length === 0) {
      throw new Error('`find` must not be empty.');
    }

    const firstIdx = original.indexOf(input.find);
    if (firstIdx === -1) {
      throw new Error(
        '`find` text was not found in the file. Make sure the text matches exactly,' +
          ` including indentation and whitespace.\n--- find ---\n${input.find}`
      );
    }
    const secondIdx = original.indexOf(input.find, firstIdx + 1);
    if (secondIdx !== -1) {
      throw new Error(
        '`find` text appears more than once in the file. Add surrounding context to' +
          ` make it unique.\n--- find ---\n${input.find}`
      );
    }

    const updated =
      original.slice(0, firstIdx) +
      input.replace +
      original.slice(firstIdx + input.find.length);

    await writeFile(absolutePath, updated, 'utf-8');
    await context.fileCache.update(absolutePath);

    return {
      success: true,
      bytesWritten: Buffer.byteLength(updated, 'utf-8'),
    };
  }

  public override inputToString(input: Input): string {
    return `Editing \`${input.filePath}\``;
  }

  public override outputToString(output: Output): string {
    if (!output.success) return `Unable to insert into file`;
    return `Applied edit (${output.bytesWritten} bytes).`;
  }
}

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
      'The exact text currently in the file that should be replaced. Must match the file content' +
        ' verbatim (including indentation and whitespace) and must be unique within the file —' +
        ' include enough surrounding context to disambiguate if needed.'
    ),
  replace: z
    .string()
    .describe(
      'The text that `find` should be replaced with. Use an empty string to delete the matched' +
        ' text. To insert without removing, include the original `find` text inside `replace`' +
        ' along with the new content.'
    ),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  success: z.boolean(),
  bytesWritten: z.number(),
});

type Output = z.infer<typeof outputSchema>;
