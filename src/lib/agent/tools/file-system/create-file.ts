import * as z from 'zod';
import { acquireContextInstance } from '../../../events/context-acquisition';
import { Result } from '../../../result';
import { createTool } from '../common';
import { formatDiffMd } from '../../../utils/diff-utils';
import { mkdir, writeFile, access } from 'fs/promises';
import { dirname } from 'path';

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

const outputSchema = z.object({
  filePath: z.string().describe('The absolute path of the created file'),
  bytesWritten: z
    .number()
    .describe('The number of bytes written to the new file'),
  created: z
    .boolean()
    .describe(
      'Whether the file was newly created (false means it was overwritten)'
    ),
});

async function safeExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export default createTool({
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

  async handle({ overwrite, createDirectories, filePath, content }) {
    const context = await acquireContextInstance();
    const override = overwrite ?? false;
    const createDirs = createDirectories ?? true;

    const alreadyExists = await safeExists(filePath);
    if (alreadyExists && !override) {
      return Result.Error(
        `File already exists at ${filePath}. Pass overwrite: true to replace it.`
      );
    }

    if (createDirs) {
      await mkdir(dirname(filePath), { recursive: true });
    }

    await context.fileCache.update(filePath);
    await writeFile(filePath, content, 'utf-8');
    return Result.Ok(
      {
        filePath,
        bytesWritten: Buffer.byteLength(content, 'utf-8'),
        created: !alreadyExists,
      },
      { current: content }
    );
  },
  inputToString({ filePath }) {
    return `Create file \`${filePath}\``;
  },
  outputToString({ filePath, created }, _, { current }) {
    const previous = created ? '' : 'File existed prior to write.';
    return `Updated \`${filePath}\`\\n${formatDiffMd(previous, current)}`;
  },
});
