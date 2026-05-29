import { type Output } from 'ai';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as z from 'zod';
import { acquireContextInstance } from '../rendering/context';
import { ToolBase } from './common';

export default class ReadFileTool extends ToolBase<Input, Output> {
  constructor() {
    super({
      internalName: 'read_file',
      name: 'Read file',
      description:
        'Reads the entire UTF-8 text content of a file from disk and returns it as a single string with' +
        ' each line prefixed by its 1-based line number and a tab (`<n>\\t<line>`). These line' +
        ' numbers can be passed to `insert_in_file` to insert new content at a specific position.\n' +
        'Accepts either an absolute path or a path relative to the working directory. Use this tool' +
        ' when you need to inspect the full contents of a known file — for example to understand its' +
        ' structure, extract information, or prepare for an edit. Do NOT use this tool to discover' +
        ' *which* files exist (use `find_file` for that) or to search for content across many files' +
        ' (use `find_in_file` for that). ONLY invoke this tool when the file content is not already' +
        ' present in the current context; prefer existing context over repeated reads.',
      inputSchema,
      outputSchema,
      mightRequireApproval: false,
    });
  }

  public override async handle(input: Input): Promise<Output> {
    const context = await acquireContextInstance();
    const resolved = path.isAbsolute(input.filePath)
      ? input.filePath
      : path.join(context.cwd, input.filePath);

    const stats = await fs.stat(resolved);
    const raw = await fs.readFile(resolved, 'utf8');

    const newline = raw.match(/\r?\n/)?.[0] ?? '\n';
    const lines = raw.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    const width = String(lines.length).length;
    const numbered = lines
      .map((line, i) => `${String(i + 1).padStart(width, ' ')}\t${line}`)
      .join(newline);

    context.fileCache.set(resolved, stats.mtimeMs);

    return { content: numbered };
  }

  public override inputToString(input: Input): string {
    return `Reading \`${input.filePath}\``;
  }

  public override outputToString(_output: Output): string {
    return `Successfully read file`;
  }
}

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The path to the file to read. May be absolute or relative to the working directory.'
    ),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  content: z.string().describe('The full text content of the file.'),
});

type Output = z.infer<typeof outputSchema>;
