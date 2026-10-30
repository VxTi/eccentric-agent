import { isNil } from '@vxti/typed';
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
  selection: z.object({
    fromLineNumber: z
      .number()
      .describe('The starting line position of which frame to read'),
    lineCount: z
      .optional(z.number())
      .describe(
        "The amount of lines to read. If it's clear that you require all content, this can be skipped"
      ),
  }),
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

  async handle({ filePath, selection: { fromLineNumber, lineCount } }) {
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

    if (isNil(lineCount)) {
      // Returns all the file's contents
      if (fromLineNumber === 0) {
        return Result.Ok({
          filePath,
          content: prefixWithLineNumbers(lines, newline),
        });
      }

      // Returns file content starting from line
      return Result.Ok({
        filePath,
        content: prefixWithLineNumbers(lines.slice(fromLineNumber), newline),
      });
    }

    // Returns file content frame from a -> b
    return Result.Ok({
      content: prefixWithLineNumbers(
        lines.slice(fromLineNumber, fromLineNumber + lineCount),
        newline
      ),
      filePath,
    });
  },

  inputToString({ filePath }) {
    return `Reading \`${filePath}\``;
  },

  outputToString({ filePath }) {
    return `Read \`${filePath}\``;
  },
});
