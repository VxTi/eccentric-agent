import { z } from 'zod';
import { createTool } from '../tools';
import { readFile, writeFile } from 'fs/promises';

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The absolute path of the file in which content will be inserted'
    ),
  content: z
    .string()
    .describe('The content to insert into the file at the specified range'),
  startLine: z
    .number()
    .describe(
      'The 1-based line number at which insertion begins. When `endLine` equals `startLine - 1`, the' +
        ' content is inserted before `startLine` without replacing anything.'
    ),
  endLine: z
    .number()
    .describe(
      'The 1-based inclusive line number at which the replacement range ends. Lines from `startLine` to' +
        ' `endLine` (inclusive) will be replaced by `content`. To perform a pure insertion without removing' +
        ' any existing lines, set `endLine` to `startLine - 1`.'
    ),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  success: z
    .boolean()
    .describe('Whether the insertion was applied successfully'),
  linesReplaced: z
    .number()
    .describe(
      'The number of existing lines that were replaced by this operation'
    ),
  totalLines: z
    .number()
    .describe('The total number of lines in the file after the operation'),
});

type Output = z.infer<typeof outputSchema>;

async function handler(input: Input): Promise<Output> {
  const original = await readFile(input.filePath, 'utf-8');
  const newlineMatch = original.match(/\r?\n/);
  const newline = newlineMatch ? newlineMatch[0] : '\n';
  const lines = original.split(/\r?\n/);

  const start = Math.max(1, input.startLine);
  const end = Math.max(start - 1, input.endLine);

  const startIdx = start - 1;
  const deleteCount = end - start + 1;

  const insertLines = input.content.split(/\r?\n/);
  lines.splice(startIdx, deleteCount, ...insertLines);

  await writeFile(input.filePath, lines.join(newline), 'utf-8');

  return {
    success: true,
    linesReplaced: deleteCount,
    totalLines: lines.length,
  };
}

export default createTool(
  'insert_in_file',
  'Insert in file',
  'Inserts or replaces content in a file across a specified line range. The lines from `startLine` to' +
    ' `endLine` (inclusive, 1-based) are replaced with the provided `content`. To perform a pure insertion' +
    ' that does not remove any existing lines, pass `endLine` equal to `startLine - 1`. Use this tool when' +
    ' you need to programmatically modify a known region of a file — for example after locating a target' +
    ' range via `find_in_file`. Ensure you have accurate line numbers before invoking, as this operation' +
    ' overwrites the existing file contents.',
  inputSchema,
  outputSchema,
  handler
);
