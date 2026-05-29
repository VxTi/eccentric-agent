import { type Output } from 'ai';
import * as z from 'zod';
import { ToolBase } from './common';
import { mkdir, writeFile, access } from 'fs/promises';
import { dirname } from 'path';

export default class CreateFileTool extends ToolBase<Input, Output> {
  constructor() {
    super({
      internalName: 'create_file',
      name: 'Create File',
      description:
        'Creates a new file at the specified absolute path with the given textual content. By default fails if a' +
        ' file already exists at that path; pass `overwrite: true` to replace it. Missing parent directories' +
        ' are created automatically unless `createDirectories` is set to false. Use this tool when you need to' +
        ' produce an entirely new file (e.g. a new module, config file, or script). For editing an existing' +
        ' file, prefer `insert_in_file` instead.',
      inputSchema,
      outputSchema,
      mightRequireApproval: false,
    });
  }

  public override async handle(input: Input): Promise<Output> {
    const overwrite = input.overwrite ?? false;
    const createDirs = input.createDirectories ?? true;

    const alreadyExists = await this.exists(input.filePath);
    if (alreadyExists && !overwrite) {
      throw new Error(
        `File already exists at ${input.filePath}. Pass overwrite: true to replace it.`
      );
    }

    if (createDirs) {
      await mkdir(dirname(input.filePath), { recursive: true });
    }

    await writeFile(input.filePath, input.content, 'utf-8');

    return {
      filePath: input.filePath,
      bytesWritten: Buffer.byteLength(input.content, 'utf-8'),
      created: !alreadyExists,
    };
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  public override inputToString(input: Input): string {
    return `Create file \`${input.filePath}\``;
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1 << 30) return `${bytes / (1 << 30)}GB`;

    if (bytes >= 1 << 20) return `${bytes / (1 << 20)}MB`;
    if (bytes >= 1 << 10) return `${bytes / (1 << 20)}KB`;

    return `${bytes}bytes`;
  }

  public override outputToString(output: Output): string {
    const { filePath, created, bytesWritten } = output;

    return `${created ? 'Created' : 'Wrote to'} file '${filePath}' (${this.formatBytes(bytesWritten)})`;
  }
}

const inputSchema = z.object({
  filePath: z.string().describe('The absolute path of the file to create'),
  content: z.string().describe('The content to write into the new file'),
  overwrite: z
    .boolean()
    .optional()
    .describe(
      'When true, an existing file at `filePath` will be overwritten. Defaults to false: if the file' +
        ' already exists the call will fail without modifying the existing file.'
    ),
  createDirectories: z
    .boolean()
    .optional()
    .describe(
      'When true, any missing parent directories of `filePath` will be created. Defaults to true.'
    ),
});

type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  filePath: z.string().describe('The absolute path of the created file'),
  bytesWritten: z.number().describe('The number of bytes written to the new file'),
  created: z
    .boolean()
    .describe('Whether the file was newly created (false means it was overwritten)'),
});

type Output = z.infer<typeof outputSchema>;
