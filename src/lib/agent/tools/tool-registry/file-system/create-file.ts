import * as z from 'zod';
import path from 'node:path';
import { Result } from '../../../../result';
import { store } from '../../../../state';
import { formatDiffMd } from '../../../../utils/diff-utils';
import { mkdir, writeFile, access } from 'fs/promises';
import { createTool } from '../../tool-definition';

const inputSchema = z.object({
  path: z.string().describe('The absolute path of the file to create'),
  content: z.string().describe('The content to write into the new file'),
  overwrite: z
    .boolean()
    .optional()
    .describe(
      'When true, an existing file at `filePath` will be overwritten. Defaults to false: if the file' +
        ' already exists the call will fail without modifying the existing file.'
    ),
});

const outputSchema = z.object({
  success: z.boolean().describe('Whether the file was successfully updated'),
});

async function safeExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export const createFile = createTool({
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

  async handle({ overwrite, path: filePath, content }) {
    const {
      agent: { fileCache },
    } = store.getState();
    const override = overwrite ?? false;

    const alreadyExists = await safeExists(filePath);
    if (alreadyExists && !override) {
      return Result.Error(
        `File already exists at ${filePath}. Pass overwrite: true to replace it.`
      );
    }
    await mkdir(path.basename(path.dirname(filePath)), { recursive: true });

    await fileCache.update(filePath);
    await writeFile(filePath, content, 'utf-8');
    return Result.Ok({ success: true }, { filePath, newContent: content });
  },
  inputToString: ({ path: filePath }) => `Create file \`${filePath}\``,
  outputToString(_, __, { newContent, filePath }) {
    return `Updated \`${filePath}\`\\n${formatDiffMd('', newContent)}`;
  },
});
