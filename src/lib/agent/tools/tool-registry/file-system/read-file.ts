import { isNil, isNotNil } from '@vxti/typed';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as z from 'zod';
import { Result } from '../../../../result';
import { store } from '../../../../state';
import { detectLineEnding, LINE_BREAK } from '../../../../utils/string-utils';
import { createTool } from '../../tool-definition';

const MIN_LINE_NUMBER_OFFSET = 1;

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
          .describe(
            `The starting line position of which frame to read, starting from ${MIN_LINE_NUMBER_OFFSET}`
          ),
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
      "An optional selection to provide, if you don't need to read the entire file. ONLY omit this if you need" +
        ' to read everything in the file, otherwise provide a selection.'
    ),
});

const outputSchema = z.object({
  content: z.string(),
  filePath: z.string(),
});

function prefixWithLineNumbers(
  lines: string[],
  newline: string,
  offset: number = 0
): string {
  const maxLineNumber = lines.length + offset;
  const width = String(maxLineNumber).length;

  return lines
    .map(
      (line, i) =>
        `${String(i + MIN_LINE_NUMBER_OFFSET + offset).padStart(width, ' ')}\t${line}`
    )
    .join(newline);
}

export const readFile = createTool({
  internalName: 'read_file',
  name: 'Read file',
  description:
    'Read one whole UTF-8 file off disk. One string back. Each line prefixed by its 1-based' +
    ' number and a tab: `<n>\\t<line>`. Feed those numbers to `replace_in_file` to change content' +
    ' at an exact line.\n' +
    'Path: absolute, or relative to working dir. What is it for? The full body of one file you' +
    ' already know. See its shape. Pull a fact. Prep an edit. What is it NOT for? Learning *which*' +
    ' files exist — that is `find_file`. Hunting text across many files — that is `find_in_file`.\n' +
    'Rule: invoke ONLY when the content is not in context. Already in context? Do not read it' +
    ' again.',
  inputSchema,
  outputSchema,

  async handle({ filePath, selection }) {
    const {
      agent: {
        agent: { fileCache },
      },
      fileSystem: { cwd },
    } = store.getState();

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(cwd, filePath);

    const stats = await fs.stat(absolutePath);
    const raw = await fs.readFile(absolutePath, 'utf8');

    fileCache.set(absolutePath, stats.mtimeMs);

    const newline = detectLineEnding(raw);
    const lines = raw.split(LINE_BREAK);

    if (!isValidSelection(selection, lines.length)) {
      return Result.Error(`Invalid selection, line count: ${lines.length}`);
    }

    const content = prefixWithLineNumbers(
      getLines(selection, lines),
      newline,
      selection ? selection.fromLineNumber - 1 : undefined
    );
    return Result.Ok({ content, filePath }, { selection });
  },

  inputToString({ filePath, selection }) {
    return `Reading \`${filePath}\`${formatSelection(selection)}`;
  },

  outputToString({ filePath }, _, { selection }) {
    const cwd = store.getState().fileSystem.cwd;
    return `Read \`${path.relative(cwd, filePath)}\`${formatSelection(selection)}`;
  },
});

function isValidSelection(
  selection: z.infer<typeof inputSchema>['selection'],
  lines: number
): selection is z.infer<typeof inputSchema>['selection'] {
  if (isNil(selection)) return true;

  const { fromLineNumber, lineCount } = selection;

  const isValidFromLineNumber = isWithinRange(
    fromLineNumber,
    MIN_LINE_NUMBER_OFFSET,
    lines
  );

  if (isNil(lineCount)) {
    return isValidFromLineNumber;
  }

  const endLineNumber = fromLineNumber + lineCount - 1;
  return isValidFromLineNumber && lineCount >= 1 && endLineNumber <= lines;
}

function isWithinRange(input: number, min: number, max: number): boolean {
  return input >= min && input <= max;
}
function getLines(
  selection: z.infer<typeof inputSchema>['selection'],
  lines: string[]
): string[] {
  if (isNil(selection)) return lines;

  // `lines` is a 0-based array; `fromLineNumber` is 1-based, so the first
  // requested line sits at index `fromLineNumber - 1`.
  const start = selection.fromLineNumber - 1;

  const endOffset = isNotNil(selection.lineCount)
    ? start + selection.lineCount
    : undefined;

  return lines.slice(start, endOffset);
}

function formatSelection(selection: z.infer<typeof inputSchema>['selection']) {
  if (!selection) return '';
  const ending = isNotNil(selection.lineCount)
    ? selection.fromLineNumber + selection.lineCount - 1
    : '...';

  return ` (Line \`${selection.fromLineNumber}\` → \`${ending}\`)`;
}
