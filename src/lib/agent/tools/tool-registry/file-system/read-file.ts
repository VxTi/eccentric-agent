import { isNil, isNotNil } from '@vxti/typed';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as z from 'zod';
import { Result } from '../../../../result';
import { store } from '../../../../state';
import { createTool } from '../../tool-definition';

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The path to the file to read. May be absolute or relative to the working directory.'
    ),
  selection: z
    .optional(
      z.object({
        fromLineNumber: z
          .number()
          .describe('The starting line position of which frame to read'),
        lineCount: z
          .number()
          .optional()
          .describe(
            "The amount of lines to read. If it's clear that you require all lines after the starting one, " +
              ' this can be omitted'
          ),
      })
    )
    .describe(
      "An optional selection to provide, if you don\'t need to read the entire file. Prefer using selections to reduce context pollution"
    ),
});

const outputSchema = z.object({
  content: z.string(),
  filePath: z.string(),
});

function prefixWithLineNumbers(lines: string[], newline: string): string {
  const width = String(lines.length).length;
  return lines
    .map((line, i) => `${String(i + 1).padStart(width, ' ')}\t${line}`)
    .join(newline);
}

export const readFile = createTool({
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

  async handle({ filePath, selection }) {
    const {
      agent: { fileCache },
      fileSystem: { cwd },
    } = store.getState();

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(cwd, filePath);

    const stats = await fs.stat(absolutePath);
    const raw = await fs.readFile(absolutePath, 'utf8');

    fileCache.set(absolutePath, stats.mtimeMs);

    const newline = raw.match(/\r?\n/)?.[0] ?? '\n';
    const lines = raw.split(/\r?\n/);

    if (
      isNotNil(selection) &&
      (selection.fromLineNumber < 0 ||
        selection.fromLineNumber + (selection.lineCount ?? 0) > lines.length)
    ) {
      return Result.Error(`Invalid selection, line count: ${lines.length}`);
    }

    const content = prefixWithLineNumbers(
      isNil(selection)
        ? lines
        : lines.slice(
            selection.fromLineNumber,
            isNotNil(selection.lineCount)
              ? selection.fromLineNumber + selection.lineCount
              : undefined
          ),
      newline
    );

    return Result.Ok({ content, filePath }, { selection });
  },

  inputToString({ filePath, selection }) {
    return `Reading \`${filePath}\`${formatSelection(selection)}`;
  },

  outputToString({ filePath }, _, { selection }) {
    return `Read \`${filePath}\`${formatSelection(selection)}`;
  },
});

function formatSelection(selection: z.infer<typeof inputSchema>['selection']) {
  if (!selection) return '';

  return ` (Line \`${selection.fromLineNumber + 1}\` → \`${isNotNil(selection.lineCount) ? selection.fromLineNumber + selection.lineCount : '...'}\`)`;
}
