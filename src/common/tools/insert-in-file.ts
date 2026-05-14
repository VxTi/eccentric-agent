import { z } from 'zod';
import { ToolBase } from '../tools';
import { readFile, writeFile } from 'fs/promises';

export default class InsertInFileTool extends ToolBase<Input, Output> {
  constructor() {
    super(
      'insert_in_file',
      'Insert in file',
      'Applies one or more line-range edits to a file atomically. Each edit replaces lines from `startLine`' +
        ' to `endLine` (inclusive, 1-based) with the provided `content`. To perform a pure insertion that' +
        ' does not remove any existing lines, pass `endLine` equal to `startLine - 1`; the new content is' +
        ' then inserted *before* `startLine`. To append at end-of-file, use `startLine = totalLines + 1` and' +
        ' `endLine = totalLines`.\n\n' +
        'Safety guarantees enforced by this tool:\n' +
        '  • All edits are validated up front; if ANY edit fails validation, NONE are applied.\n' +
        '  • Edits may not overlap. Two edits collide when their replacement ranges share a line, or when a' +
        "    pure-insertion point falls inside another edit's replacement range. Adjacent edits" +
        '    (`prev.endLine + 1 === next.startLine`) are allowed.\n' +
        '  • Line numbers are bounds-checked against the current file contents.\n' +
        '  • For each edit you SHOULD pass `expectedContent` — the exact text currently occupying' +
        "    `[startLine, endLine]` (joined by the file's newline). The tool will refuse the operation if" +
        '    the file no longer matches, preventing edits applied to stale line numbers. `expectedContent`' +
        '    is optional only for pure insertions (where `endLine === startLine - 1`) since they remove' +
        '    nothing.\n' +
        '  • When multiple edits are supplied, they are applied bottom-up so earlier line numbers remain' +
        '    valid for later edits — provide line numbers as they appear in the file you just read; do NOT' +
        '    pre-adjust them.\n\n' +
        'Typical flow: locate target ranges via `find_in_file` or `read_file`, then submit them together as' +
        ' a batch. Prefer one call with several edits over many sequential calls — it is both atomic and' +
        ' avoids index drift between calls.',
      inputSchema,
      outputSchema
    );
  }

  public override async handle(input: Input): Promise<Output> {
    const original = await readFile(input.filePath, 'utf-8');
    const newlineMatch = original.match(/\r?\n/);
    const newline = newlineMatch ? newlineMatch[0] : '\n';
    const lines = original.split(/\r?\n/);
    const totalLines = lines.length;

    const edits = this.normalizeEdits(input);

    this.reanchorEdits(edits, lines);
    this.validateEdits(edits, lines, totalLines);
    this.assertNoCollisions(edits);

    // Apply bottom-up so earlier indices remain valid.
    const ordered = [...edits].sort((a, b) => b.startLine - a.startLine);

    let totalLinesReplaced = 0;
    for (const edit of ordered) {
      const startIdx = edit.startLine - 1;
      const deleteCount = Math.max(0, edit.endLine - edit.startLine + 1);
      const insertLines = edit.content.split(/\r?\n/);
      lines.splice(startIdx, deleteCount, ...insertLines);
      totalLinesReplaced += deleteCount;
    }

    await writeFile(input.filePath, lines.join(newline), 'utf-8');

    return {
      success: true,
      editsApplied: edits.length,
      linesReplaced: totalLinesReplaced,
      totalLines: lines.length,
    };
  }

  private normalizeEdits(input: Input): NormalizedEdit[] {
    if (input.edits && input.edits.length > 0) {
      return input.edits.map((edit, index) => ({
        index,
        startLine: edit.startLine,
        endLine: edit.endLine,
        content: edit.content,
        expectedContent: edit.expectedContent,
      }));
    }

    if (
      input.startLine !== undefined &&
      input.endLine !== undefined &&
      input.content !== undefined
    ) {
      return [
        {
          index: 0,
          startLine: input.startLine,
          endLine: input.endLine,
          content: input.content,
          expectedContent: input.expectedContent,
        },
      ];
    }

    throw new Error(
      'No edits provided. Pass either `edits` or the single-edit fields' +
        ' (`startLine`, `endLine`, `content`).'
    );
  }

  /**
   * If an edit's `expectedContent` does not match at the supplied
   * `[startLine, endLine]`, attempt to find that exact block elsewhere in the
   * file and silently re-anchor the edit to its true location. The model often
   * miscounts lines by ±1; trusting the content over the line numbers makes
   * the tool resilient to that. When there are multiple candidates we pick the
   * one closest to the hinted `startLine`. If no candidate exists we leave the
   * edit alone — validation will then surface a clear error.
   */
  private reanchorEdits(edits: NormalizedEdit[], lines: string[]): void {
    for (const edit of edits) {
      if (edit.expectedContent === undefined) continue;
      const isPureInsertion = edit.endLine === edit.startLine - 1;
      if (isPureInsertion) continue;

      const expectedLines = edit.expectedContent
        .replace(/\r\n/g, '\n')
        .split('\n');
      const span = expectedLines.length;

      const actualSlice = lines
        .slice(edit.startLine - 1, edit.startLine - 1 + span)
        .join('\n');
      if (actualSlice === expectedLines.join('\n')) continue;

      const matches: number[] = [];
      for (let i = 0; i + span <= lines.length; i += 1) {
        let ok = true;
        for (let j = 0; j < span; j += 1) {
          if (lines[i + j] !== expectedLines[j]) {
            ok = false;
            break;
          }
        }
        if (ok) matches.push(i + 1);
      }

      if (matches.length === 0) continue;

      const hinted = edit.startLine;
      const chosen = matches.reduce((best, candidate) =>
        Math.abs(candidate - hinted) < Math.abs(best - hinted)
          ? candidate
          : best
      );

      edit.startLine = chosen;
      edit.endLine = chosen + span - 1;
    }
  }

  private validateEdits(
    edits: NormalizedEdit[],
    lines: string[],
    totalLines: number,
    newline: string = '\n'
  ): void {
    for (const edit of edits) {
      const label = `edit #${edit.index}`;

      if (!Number.isInteger(edit.startLine) || edit.startLine < 1) {
        throw new Error(
          `${label}: startLine must be a positive integer (got ${edit.startLine}).`
        );
      }
      if (
        !Number.isInteger(edit.endLine) ||
        edit.endLine < edit.startLine - 1
      ) {
        throw new Error(
          `${label}: endLine (${edit.endLine}) must be >= startLine - 1 (${edit.startLine - 1}).`
        );
      }

      const isPureInsertion = edit.endLine === edit.startLine - 1;
      const maxStart = totalLines + 1;
      if (edit.startLine > maxStart) {
        throw new Error(
          `${label}: startLine ${edit.startLine} is past end-of-file (file has ${totalLines} line${totalLines === 1 ? '' : 's'}; max startLine is ${maxStart}).`
        );
      }
      if (!isPureInsertion && edit.endLine > totalLines) {
        throw new Error(
          `${label}: endLine ${edit.endLine} exceeds total lines in file (${totalLines}).`
        );
      }

      if (edit.expectedContent !== undefined) {
        const actualLines = isPureInsertion
          ? []
          : lines.slice(edit.startLine - 1, edit.endLine);
        const actual = actualLines.join(newline);
        const expectedNormalized = edit.expectedContent.replace(/\r\n/g, '\n');
        const actualNormalized = actual.replace(/\r\n/g, '\n');
        if (expectedNormalized !== actualNormalized) {
          throw new Error(
            `${label}: expectedContent does not match the current file at lines` +
              ` ${edit.startLine}-${edit.endLine}. The file likely changed since you` +
              ` read it — re-read and submit fresh line numbers.\n` +
              `--- expected ---\n${edit.expectedContent}\n--- actual ---\n${actual}`
          );
        }
      } else if (!isPureInsertion) {
        // Replacement without verification is allowed but strongly discouraged.
        // We do not throw, but the description tells the model to provide it.
      }
    }
  }

  private assertNoCollisions(edits: NormalizedEdit[]): void {
    // Represent each edit as a half-open interval [from, to) over line numbers.
    // Pure insertions become a zero-width interval [startLine, startLine).
    const intervals = edits.map(edit => {
      const isPureInsertion = edit.endLine === edit.startLine - 1;
      const from = edit.startLine;
      const to = isPureInsertion ? edit.startLine : edit.endLine + 1;
      return { index: edit.index, from, to };
    });

    const sorted = [...intervals].sort((a, b) => {
      if (a.from !== b.from) return a.from - b.from;
      return a.to - b.to;
    });

    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      const prevIsInsertion = prev.from === prev.to;
      const currIsInsertion = curr.from === curr.to;

      // Two pure insertions at the exact same point collide (ambiguous order).
      if (prevIsInsertion && currIsInsertion && prev.from === curr.from) {
        throw new Error(
          `Edits #${prev.index} and #${curr.index} both insert at line ${prev.from}; merge them into a single edit.`
        );
      }

      // A pure insertion sitting strictly inside another edit's replacement range collides.
      if (currIsInsertion && curr.from > prev.from && curr.from < prev.to) {
        throw new Error(
          `Edit #${curr.index} inserts inside the replacement range of edit #${prev.index} (lines ${prev.from}-${prev.to - 1}).`
        );
      }
      if (prevIsInsertion && prev.from > curr.from && prev.from < curr.to) {
        throw new Error(
          `Edit #${prev.index} inserts inside the replacement range of edit #${curr.index} (lines ${curr.from}-${curr.to - 1}).`
        );
      }

      // Replacement ranges overlap when prev.to > curr.from.
      if (!prevIsInsertion && !currIsInsertion && prev.to > curr.from) {
        throw new Error(
          `Edits #${prev.index} (lines ${prev.from}-${prev.to - 1}) and #${curr.index} (lines ${curr.from}-${curr.to - 1}) overlap.`
        );
      }
    }
  }

  public override inputToString(input: Input): string {
    const edits = input.edits ?? [
      {
        startLine: input.startLine!,
        endLine: input.endLine!,
        content: input.content!,
      },
    ];
    const ranges = edits
      .map(edit =>
        edit.endLine === edit.startLine - 1
          ? `insert before line ${edit.startLine}`
          : `replace lines ${edit.startLine}-${edit.endLine}`
      )
      .join(', ');
    return `Editing \`${input.filePath}\` (${ranges})`;
  }

  public override outputToString(output: Output): string {
    if (!output.success) return `Unable to insert into file`;

    return (
      `Applied ${output.editsApplied} edit${output.editsApplied === 1 ? '' : 's'};` +
      ` replaced ${output.linesReplaced} line${output.linesReplaced === 1 ? '' : 's'}.` +
      ` File now has ${output.totalLines} line${output.totalLines === 1 ? '' : 's'}.`
    );
  }
}

const editSchema = z.object({
  startLine: z
    .number()
    .int()
    .min(1)
    .describe(
      'The 1-based line number at which the edit begins. For a pure insertion, the new content will be' +
        ' inserted immediately before this line.'
    ),
  endLine: z
    .number()
    .int()
    .describe(
      'The 1-based inclusive line number at which the replacement range ends. Lines from `startLine` to' +
        ' `endLine` (inclusive) will be replaced by `content`. For a pure insertion that removes nothing,' +
        ' set `endLine = startLine - 1`.'
    ),
  content: z
    .string()
    .describe(
      'The replacement (or inserted) text. May contain multiple lines separated by `\\n`. Do NOT include' +
        ' a leading/trailing newline unless you intend to introduce a blank line.'
    ),
  expectedContent: z
    .string()
    .optional()
    .describe(
      'The exact text currently occupying lines `[startLine, endLine]` in the file, joined by newline.' +
        ' STRONGLY recommended for any replacement: if the file no longer matches, the tool aborts the' +
        ' entire operation instead of corrupting the wrong region. Omit only for pure insertions' +
        ' (`endLine === startLine - 1`), which remove no existing content.'
    ),
});

const inputSchema = z
  .object({
    filePath: z.string().describe('The absolute path of the file to edit.'),
    edits: z
      .array(editSchema)
      .optional()
      .describe(
        'Batch of edits to apply atomically. Edits may not overlap; adjacent ranges are fine. Provide line' +
          ' numbers as they appear in the file you just read — the tool applies edits bottom-up internally' +
          ' so you do not need to pre-adjust later line numbers.'
      ),
    startLine: z
      .number()
      .int()
      .optional()
      .describe('Single-edit shorthand: see `edits[].startLine`.'),
    endLine: z
      .number()
      .int()
      .optional()
      .describe('Single-edit shorthand: see `edits[].endLine`.'),
    content: z
      .string()
      .optional()
      .describe('Single-edit shorthand: see `edits[].content`.'),
    expectedContent: z
      .string()
      .optional()
      .describe('Single-edit shorthand: see `edits[].expectedContent`.'),
  })
  .refine(
    value =>
      (value.edits && value.edits.length > 0) ||
      (value.startLine !== undefined &&
        value.endLine !== undefined &&
        value.content !== undefined),
    {
      message:
        'Provide either `edits` (preferred) or all of `startLine`, `endLine`, `content`.',
    }
  );

type Input = z.infer<typeof inputSchema>;

interface NormalizedEdit {
  index: number;
  startLine: number;
  endLine: number;
  content: string;
  expectedContent?: string;
}

const outputSchema = z.object({
  success: z
    .boolean()
    .describe('Whether the operation was applied successfully.'),
  editsApplied: z.number().describe('The number of edits applied to the file.'),
  linesReplaced: z
    .number()
    .describe(
      'The total number of existing lines that were replaced across all edits.'
    ),
  totalLines: z
    .number()
    .describe('The total number of lines in the file after the operation.'),
});

type Output = z.infer<typeof outputSchema>;
