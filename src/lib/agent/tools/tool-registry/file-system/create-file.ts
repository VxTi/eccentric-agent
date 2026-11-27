import * as z from 'zod';
import path from 'node:path';
import { Result } from '../../../../result';
import { store } from '../../../../state';
import {
  diffLanguageForFile,
  generateSideBySideDiff,
} from '../../../../utils/diff-utils';
import { mkdir, writeFile } from 'fs/promises';
import { existsAsync } from '../../../../utils/fs';
import { createTool } from '../../tool-definition';
import { MessagePartType } from '../../../../types/messages';

const inputSchema = z.object({
  path: z.string().describe('The absolute path of the file to create'),
  content: z.string().describe('The content to write into the new file'),
  overwrite: z
    .boolean()
    .optional()
    .describe(
      'When true, an existing file at `path` will be overwritten. Defaults to false: if the file' +
        ' already exists the call will fail without modifying the existing file.'
    ),
  createDirectories: z
    .boolean()
    .optional()
    .describe(
      'When true (the default), missing parent directories of `path` are created automatically.' +
        ' Set to false to fail instead when a parent directory does not exist.'
    ),
});

const outputSchema = z.object({
  success: z.boolean().describe('Whether the file was successfully updated'),
});

export const createFile = createTool({
  internalName: 'create_file',
  name: 'Create File',
  description:
    'Creates a new file at the specified absolute path with the given textual content. By default fails if a' +
    ' file already exists at that path; pass `overwrite: true` to replace it. Missing parent directories' +
    ' are created automatically unless `createDirectories` is set to false. Use this tool when you need to' +
    ' produce an entirely new file (e.g. a new module, config file, or script). For editing an existing' +
    ' file, prefer `replace_in_file` instead.',
  inputSchema,
  outputSchema,
  requiresApproval: ({ overwrite }) => {
    // Doesn't require approval if auto-approval is enabled
    // and it's not trying to overwrite an existing file
    return !store.getState().agent.autoApprove && !overwrite;
  },

  formatArguments: ({ path: filePath }) => `Creating a file at \`${filePath}\``,

  handle: createFileImpl,

  inputToString: ({ path: filePath }) => `Writing file \`${filePath}\``,

  outputToString(_, __, { filePath }) {
    return `Wrote to \`${filePath}\``;
  },

  outputToParts(_, __, { filePath, newContent }) {
    return [
      {
        type: MessagePartType.DIFF,
        previous: '',
        current: newContent,
        rows: generateSideBySideDiff('', newContent),
        language: diffLanguageForFile(filePath),
      },
    ];
  },
});

async function createFileImpl({
  overwrite,
  createDirectories,
  path: filePath,
  content,
}: z.infer<typeof inputSchema>) {
  const {
    agent: { agent },
  } = store.getState();
  const { fileCache } = agent;
  const override = overwrite ?? false;

  const alreadyExists = await existsAsync(filePath);
  if (alreadyExists && !override) {
    return Result.Error(
      `File already exists at ${filePath}. Pass overwrite: true to replace it.`
    );
  }

  if (createDirectories ?? true) {
    await mkdir(path.dirname(filePath), { recursive: true });
  }

  await writeFile(filePath, content, 'utf-8');
  await fileCache.update(filePath);
  return Result.Ok({
    data: { success: true },
    context: { filePath, newContent: content },
  });
}
