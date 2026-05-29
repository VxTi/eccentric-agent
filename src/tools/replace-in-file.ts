import { readFile, writeFile } from 'fs/promises';
import { z } from 'zod';
import { type AgentContext } from '../rendering/context';
import { ToolBase } from './common';

export default class ReplaceInFileTool extends ToolBase<Input, Output> {
  constructor() {
    super({
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
    });
  }

  public override async handle(input: Input, context: AgentContext): Promise<Output> {
    const absolutePath = await context.fileCache.getCachedFilePath(input.filePath);

    let working = await readFile(absolutePath, 'utf-8');
    for (let i = 0; i < input.replacements.length; i += 1) {
      const replacement = input.replacements[i];
      const label = `replacement #${i}`;

      if (replacement.find.length === 0) {
        throw new Error(`${label}: \`find\` must not be empty.`);
      }
      if (replacement.find.includes('\n')) {
        throw new Error(`${label}: \`find\` must be a single line (no newline characters).`);
      }
      if (replacement.replace.includes('\n')) {
        throw new Error(`${label}: \`replace\` must be a single line (no newline characters).`);
      }

      const firstIdx = working.indexOf(replacement.find);
      if (firstIdx === -1) {
        throw new Error(
          `${label}: \`find\` text was not found in the file. Make sure it matches exactly,` +
            ` including indentation and whitespace.\n--- find ---\n${replacement.find}`
        );
      }
      const secondIdx = working.indexOf(replacement.find, firstIdx + 1);
      if (secondIdx !== -1) {
        throw new Error(
          `${label}: \`find\` text appears more than once in the file. This tool requires each` +
            ` \`find\` to be unique within the file.\n--- find ---\n${replacement.find}`
        );
      }

      working =
        working.slice(0, firstIdx) +
        replacement.replace +
        working.slice(firstIdx + replacement.find.length);
    }

    await writeFile(absolutePath, working, 'utf-8');
    await context.fileCache.update(absolutePath);

    return {
      success: true,
      replacementsApplied: input.replacements.length,
      bytesWritten: Buffer.byteLength(working, 'utf-8'),
    };
  }

  public override inputToString(input: Input): string {
    const count = input.replacements.length;
    return `Replacing in \`${input.filePath}\` (${count} replacement${count === 1 ? '' : 's'})`;
  }

  public override outputToString(output: Output): string {
    if (!output.success) return `Unable to replace in file`;
    return `Applied ${output.replacementsApplied} replacement${output.replacementsApplied === 1 ? '' : 's'}.`;
  }
}

const replacementSchema = z.object({
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

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The path of the file to edit. May be absolute or relative to the working directory.'
    ),
  replacements: z
    .array(replacementSchema)
    .min(1)
    .describe(
      'Single-line replacements to apply. Each is validated and applied in order against an' +
        ' in-memory copy of the file; the file on disk is written once at the end so the batch' +
        ' is atomic.'
    ),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  success: z.boolean(),
  replacementsApplied: z.number(),
  bytesWritten: z.number(),
});

type Output = z.infer<typeof outputSchema>;
