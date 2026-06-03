import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as z from 'zod';
import { acquireContextInstance } from '../../events/context-acquisition';
import { createTool } from './common';

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The path to the file to read. May be absolute or relative to the working directory.'
    ),
  fromLine: z
    .number()
    .describe('The starting line position of which frame to read')
    .default(0),
  lineCount: z
    .number()
    .describe(
      "The amount of lines to read. If it's clear that you require all content, this can be skipped"
    )
    .optional(),
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

export default createTool({
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

  async handle({ filePath, fromLine, lineCount }) {
    const context = await acquireContextInstance();

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(context.cwd, filePath);

    const stats = await fs.stat(absolutePath);
    const raw = await fs.readFile(absolutePath, 'utf8');

    context.fileCache.set(absolutePath, stats.mtimeMs);

    const newline = raw.match(/\r?\n/)?.[0] ?? '\n';
    const lines = raw.split(/\r?\n/);

    if (lineCount === undefined) {
      // Returns all the file's contents
      if (fromLine === 0) {
        return {
          filePath,
          content: prefixWithLineNumbers(lines, newline),
        };
      }

      // Returns file content starting from line
      return {
        filePath,
        content: prefixWithLineNumbers(lines.slice(fromLine), newline),
      };
    }

    // Returns file content frame from a -> b
    return {
      content: prefixWithLineNumbers(
        lines.slice(fromLine, fromLine + lineCount),
        newline
      ),
      filePath,
    };
  },

  inputToString({ filePath }) {
    return `Reading \`${filePath}\``;
  },

  outputToString({ filePath }) {
    return `Read \`${filePath}\``;
  },
});
