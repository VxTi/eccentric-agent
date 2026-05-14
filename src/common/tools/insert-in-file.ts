import { z } from 'zod';
import * as path from 'node:path';
import { readFile, stat, writeFile } from 'fs/promises';
import { ToolBase } from '../tools';
import { type AgentContext } from '../agent-context';

export default class InsertInFileTool extends ToolBase<Input, Output> {
  constructor() {
    super(
      'insert_in_file',
      'Insert in file',
      'Applies one or more string-based edits to a file atomically. Each edit has `find` (the exact' +
        ' text currently in the file) and `replace` (the text it should become). The tool finds the' +
        ' unique occurrence of `find` and substitutes `replace` for it.\n\n' +
        'Usage patterns:\n' +
        '  • Replace: `find` is the existing text, `replace` is the new text.\n' +
        '  • Insert before a line: set `find` to that line and `replace` to `"<new content>\\n<find>"`.\n' +
        '  • Insert after a line: `replace` to `"<find>\\n<new content>"`.\n' +
        '  • Delete: pass an empty string for `replace`.\n\n' +
        'Rules:\n' +
        '  • `find` must match EXACTLY ONCE in the file (whitespace and indentation included). If it' +
        '    appears multiple times, extend it with surrounding context until it is unique. If it' +
        '    does not appear at all, the edit is rejected.\n' +
        '  • Edits are validated up front against the original file contents; if any edit fails,' +
        '    nothing is written.\n' +
        '  • Edits are applied in order to an in-memory copy and the result is written once at the' +
        '    end, so the operation is atomic.\n' +
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
    const filePath = path.isAbsolute(input.filePath)
      ? input.filePath
      : path.join(context.cwd, input.filePath);

    const stats = await stat(filePath);
    const cachedMtime = context.fileModificationCache.get(filePath);
    if (cachedMtime !== undefined && stats.mtimeMs > cachedMtime) {
      throw new Error(
        `File '${filePath}' was modified on disk since it was last read. Re-read it before editing.`
      );
    }

    const original = await readFile(filePath, 'utf-8');

    let working = original;
    for (let i = 0; i < input.edits.length; i += 1) {
      const edit = input.edits[i];
      const label = `edit #${i}`;

      if (edit.find.length === 0) {
        throw new Error(`${label}: \`find\` must not be empty.`);
      }

      const firstIdx = working.indexOf(edit.find);
      if (firstIdx === -1) {
        throw new Error(
          `${label}: \`find\` text was not found in the file. Make sure the text matches exactly,` +
            ` including indentation and whitespace.\n--- find ---\n${edit.find}`
        );
      }
      const secondIdx = working.indexOf(edit.find, firstIdx + 1);
      if (secondIdx !== -1) {
        throw new Error(
          `${label}: \`find\` text appears more than once in the file. Add surrounding context to` +
            ` make it unique.\n--- find ---\n${edit.find}`
        );
      }

      working =
        working.slice(0, firstIdx) +
        edit.replace +
        working.slice(firstIdx + edit.find.length);
    }

    await writeFile(filePath, working, 'utf-8');

    const after = await stat(filePath);
    context.fileModificationCache.set(filePath, after.mtimeMs);

    return {
      success: true,
      editsApplied: input.edits.length,
      bytesWritten: Buffer.byteLength(working, 'utf-8'),
    };
  }

  public override inputToString(input: Input): string {
    const count = input.edits.length;
    return `Editing \`${input.filePath}\` (${count} edit${count === 1 ? '' : 's'})`;
  }

  public override outputToString(output: Output): string {
    if (!output.success) return `Unable to insert into file`;
    return `Applied ${output.editsApplied} edit${output.editsApplied === 1 ? '' : 's'}.`;
  }
}

const editSchema = z.object({
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

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The path of the file to edit. May be absolute or relative to the working directory.'
    ),
  edits: z
    .array(editSchema)
    .min(1)
    .describe(
      'Edits to apply. Each is validated and applied in order against an in-memory copy of the' +
        ' file; the file on disk is written once at the end so the batch is atomic.'
    ),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  success: z.boolean(),
  editsApplied: z.number(),
  bytesWritten: z.number(),
});

type Output = z.infer<typeof outputSchema>;
