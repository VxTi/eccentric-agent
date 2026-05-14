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
      'Applies one or more line-range edits to a file atomically.\n\n' +
        'Each edit has `startLine`, `endLine` (1-based, inclusive) and `content`:\n' +
        '  • Replace: lines [startLine, endLine] are replaced by `content` (set endLine >= startLine).\n' +
        '  • Insert between lines: to insert *before* line N without removing anything, set' +
        '    `startLine = N` and `endLine = N - 1`. To append at end-of-file, use' +
        '    `startLine = totalLines + 1`, `endLine = totalLines`.\n\n' +
        'Safety guarantees:\n' +
        '  • The file MUST have been read via `read_file` first; this tool tracks its modification' +
        '    time and refuses to write if the file changed on disk in the meantime.\n' +
        '  • All edits are validated up front; if ANY edit fails validation, NONE are applied.\n' +
        '  • Edits may not overlap; adjacent edits (`prev.endLine + 1 === next.startLine`) are fine.\n' +
        '  • For replacements you SHOULD pass `expectedContent` — the exact text currently occupying' +
        '    `[startLine, endLine]`. If it does not match, the entire batch is rejected.\n' +
        '  • Provide line numbers exactly as they appear in the file you read; the tool applies' +
        '    edits bottom-up internally so you do not need to pre-adjust them.',
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
    if (cachedMtime === undefined) {
      throw new Error(
        `File '${filePath}' has not been read via 'read_file' in this session.` +
          ` Read it first so its line numbers and modification time can be verified.`
      );
    }
    if (stats.mtimeMs > cachedMtime) {
      throw new Error(
        `File '${filePath}' was modified on disk since it was last read` +
          ` (cached mtime ${cachedMtime}, actual ${stats.mtimeMs}).` +
          ` Re-read it and re-submit the edits against fresh line numbers.`
      );
    }

    const original = await readFile(filePath, 'utf-8');
    const newline = original.match(/\r?\n/)?.[0] ?? '\n';
    const lines = original.split(/\r?\n/);
    const hasTrailingNewline =
      lines.length > 0 && lines[lines.length - 1] === '';
    if (hasTrailingNewline) lines.pop();

    this.validate(input.edits, lines, newline);
    this.assertNoOverlap(input.edits);

    // Apply bottom-up so earlier line indices remain valid for later edits.
    const ordered = [...input.edits].sort((a, b) => b.startLine - a.startLine);

    let linesReplaced = 0;
    for (const edit of ordered) {
      const startIdx = edit.startLine - 1;
      const deleteCount = Math.max(0, edit.endLine - edit.startLine + 1);
      const insertLines =
        edit.content.length === 0 ? [] : edit.content.split(/\r?\n/);
      lines.splice(startIdx, deleteCount, ...insertLines);
      linesReplaced += deleteCount;
    }

    let result = lines.join(newline);
    if (hasTrailingNewline) result += newline;
    await writeFile(filePath, result, 'utf-8');

    // Refresh the cached mtime so subsequent edits in this session remain valid.
    const after = await stat(filePath);
    context.fileModificationCache.set(filePath, after.mtimeMs);

    return {
      success: true,
      editsApplied: input.edits.length,
      linesReplaced,
      totalLines: lines.length,
    };
  }

  private validate(edits: Edit[], lines: string[], newline: string): void {
    const totalLines = lines.length;
    for (let i = 0; i < edits.length; i += 1) {
      const edit = edits[i];
      const label = `edit #${i}`;
      const isInsertion = edit.endLine === edit.startLine - 1;

      if (!Number.isInteger(edit.startLine) || edit.startLine < 1) {
        throw new Error(
          `${label}: startLine must be a positive integer (got ${edit.startLine}).`
        );
      }
      if (edit.endLine < edit.startLine - 1) {
        throw new Error(
          `${label}: endLine (${edit.endLine}) must be >= startLine - 1 (${edit.startLine - 1}).`
        );
      }
      if (edit.startLine > totalLines + 1) {
        throw new Error(
          `${label}: startLine ${edit.startLine} is past end-of-file (file has ${totalLines} line${totalLines === 1 ? '' : 's'}).`
        );
      }
      if (!isInsertion && edit.endLine > totalLines) {
        throw new Error(
          `${label}: endLine ${edit.endLine} exceeds total lines in file (${totalLines}).`
        );
      }

      if (!isInsertion && edit.expectedContent !== undefined) {
        const actual = lines
          .slice(edit.startLine - 1, edit.endLine)
          .join(newline);
        const expected = edit.expectedContent.replace(/\r\n/g, '\n');
        const actualNorm = actual.replace(/\r\n/g, '\n');
        if (expected !== actualNorm) {
          throw new Error(
            `${label}: expectedContent does not match lines ${edit.startLine}-${edit.endLine}.\n` +
              `--- expected ---\n${edit.expectedContent}\n--- actual ---\n${actual}`
          );
        }
      }
    }
  }

  private assertNoOverlap(edits: Edit[]): void {
    // Half-open intervals over line numbers: [from, to).
    // Pure insertions are zero-width at `startLine`.
    const intervals = edits.map((edit, index) => {
      const isInsertion = edit.endLine === edit.startLine - 1;
      return {
        index,
        from: edit.startLine,
        to: isInsertion ? edit.startLine : edit.endLine + 1,
      };
    });
    const sorted = [...intervals].sort(
      (a, b) => a.from - b.from || a.to - b.to
    );

    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const prevInsert = prev.from === prev.to;
      const currInsert = curr.from === curr.to;

      if (prevInsert && currInsert && prev.from === curr.from) {
        throw new Error(
          `Edits #${prev.index} and #${curr.index} both insert at line ${prev.from}; merge them into a single edit.`
        );
      }
      if (currInsert && curr.from > prev.from && curr.from < prev.to) {
        throw new Error(
          `Edit #${curr.index} inserts inside the replacement range of edit #${prev.index}.`
        );
      }
      if (!prevInsert && !currInsert && prev.to > curr.from) {
        throw new Error(
          `Edits #${prev.index} (lines ${prev.from}-${prev.to - 1}) and #${curr.index} (lines ${curr.from}-${curr.to - 1}) overlap.`
        );
      }
    }
  }

  public override inputToString(input: Input): string {
    const ranges = input.edits
      .map(edit =>
        edit.endLine === edit.startLine - 1
          ? `insert before line ${edit.startLine}`
          : `replace lines ${edit.startLine}-${edit.endLine}`
      )
      .join(', ');
    return `Editing \`${input.filePath}\` (${ranges})`;
  }

  public override outputToString(output: Output): string {
    if (!output.success) return `Unable to insert into file`;
    return (
      `Applied ${output.editsApplied} edit${output.editsApplied === 1 ? '' : 's'};` +
      ` replaced ${output.linesReplaced} line${output.linesReplaced === 1 ? '' : 's'}.` +
      ` File now has ${output.totalLines} line${output.totalLines === 1 ? '' : 's'}.`
    );
  }
}

const editSchema = z.object({
  startLine: z
    .number()
    .int()
    .min(1)
    .describe(
      'The 1-based line number at which the edit begins. For a pure insertion the new content is' +
        ' inserted immediately before this line.'
    ),
  endLine: z
    .number()
    .int()
    .describe(
      'The 1-based inclusive line number at which the replacement ends. For a pure insertion that' +
        ' removes nothing, set `endLine = startLine - 1`.'
    ),
  content: z
    .string()
    .describe(
      'The replacement (or inserted) text. May contain multiple lines separated by `\\n`. Do NOT' +
        ' include a leading/trailing newline unless you intend to introduce a blank line.'
    ),
  expectedContent: z
    .string()
    .optional()
    .describe(
      'The exact text currently occupying lines `[startLine, endLine]`, joined by newline.' +
        ' STRONGLY recommended for any replacement: if the file no longer matches, the tool aborts' +
        ' the entire batch instead of corrupting the wrong region. Omit for pure insertions.'
    ),
});

type Edit = z.infer<typeof editSchema>;

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
      'Batch of edits to apply atomically. Edits may not overlap; adjacent ranges are fine.' +
        ' Provide line numbers as they appear in the file you just read — edits are applied' +
        ' bottom-up internally.'
    ),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  success: z
    .boolean()
    .describe('Whether the operation was applied successfully.'),
  editsApplied: z.number().describe('The number of edits applied to the file.'),
  linesReplaced: z
    .number()
    .describe(
      'The total number of existing lines that were replaced across all edits.'
    ),
  totalLines: z
    .number()
    .describe('The total number of lines in the file after the operation.'),
});

type Output = z.infer<typeof outputSchema>;
