import {
  isEmptyArray,
  isEmptyString,
  isNil,
  isNonEmptyArray,
  isNotNil,
  type NonEmptyArray,
} from '@vxti/typed';
import { readFile, writeFile } from 'fs/promises';
import path from 'node:path';
import * as z from 'zod';
import { Result } from '../../../../result';
import { store } from '../../../../state';
import { formatDiffMd } from '../../../../utils/diff-utils';
import { existsAsync } from '../../../../utils/fs';
import { detectLineEnding, LINE_BREAK } from '../../../../utils/string-utils';
import { createTool } from '../../tool-definition';

const inputSchema = z.object({
  filePath: z
    .string()
    .describe(
      'The path of the file to edit. May be absolute or relative to the working directory.'
    ),
  range: z.object({
    lineNumber: z
      .number()
      .int()
      .min(1)
      .describe(
        'The 1-based line number where the replacement range starts (inclusive), as' +
          ' last seen in `read_file` output. Proximity hint for resolving' +
          ' `range.leadingAnchor`; the anchors decide the actual line.'
      ),
    leadingAnchor: z
      .string()
      .describe(
        'The exact current content of the first line being replaced (without the' +
          ' line-number prefix). Always required: it locates the range if lines shifted' +
          ' since you last read the file.'
      ),
    trailingAnchor: z
      .string()
      .optional()
      .describe(
        'Optional exact current content of the last line being replaced (`lineNumber` +' +
          ' `count` - 1). Independent support for validating where the range ends, and' +
          ' the reliable way to tell apart a `leadingAnchor` that repeats in the file.' +
          ' The leading anchor is always present on its own, so this one stays optional;' +
          ' supply it whenever the range spans more than one line. A blank' +
          ' `trailingAnchor` carries no evidence and is ignored. When the claimed end' +
          ' disagrees but the anchor matches one line either side of it, `count` is' +
          ' corrected by one and reported as `countAdjustment`.'
      ),
    count: z
      .number()
      .int()
      .min(1)
      .describe(
        'The number of consecutive lines to replace, starting at the anchored line.' +
          ' Must be >= 1. Corrected by one when `trailingAnchor` sits just outside' +
          ' the claimed range; the correction is reported as `countAdjustment`.'
      ),
  }),
  replacement: z
    .string()
    .describe(
      'The text to insert in place of the removed range. May contain multiple lines' +
        ' separated by `\\n`, or be empty to delete the range entirely. A trailing `\\n`' +
        ' is a separator and is dropped; the file keeps its own trailing-newline state.'
    ),
});

const outputSchema = z.object({
  startLine: z.number(),
  linesRemoved: z.number(),
  countAdjustment: z
    .number()
    .int()
    .describe(
      'How far `count` was corrected to match `trailingAnchor`: -1, 0, or 1.'
    ),
  linesInserted: z.number(),
  duplicatesRemoved: z.number(),
  duplicatedSeamLines: z.array(z.string()),
  filePath: z.string(),
});

const MAX_SHOWN_LINES = 5;
const TRAILING_LINE_BREAK = /\r?\n$/;
const READ_FILE_PREFIX = /^\s*\d+\t/;

export const replaceInFile = createTool({
  internalName: 'replace_in_file',
  name: 'Replace in file',
  description:
    'Replaces a contiguous range of lines in `filePath` with `replacement`. The range' +
    ' starts at the line matching `range.leadingAnchor` (exactly, or ignoring' +
    ' surrounding whitespace) near `range.lineNumber`, and spans `range.count` lines' +
    ' (inclusive). When `range.trailingAnchor` is supplied it must match the line the' +
    ' range ends on.\n\n' +
    'Use this tool when changing one or more consecutive lines in a file. To insert new' +
    ' lines without losing existing content, replace a line at the insertion point with' +
    ' `replacement` set to that same line plus the new lines.\n\n' +
    'Rules:\n' +
    '  • `lineNumber` is 1-based; `count` must be >= 1.\n' +
    '  • `leadingAnchor` must be the current content of the first replaced line. If that' +
    '    line moved (e.g. after an earlier edit), the nearest matching line is used and' +
    '    reported as `startLine`: matching is exact first, then ignoring surrounding' +
    '    whitespace, with the hinted line preferred when it matches either way. The' +
    '    edit is rejected if no line matches, or if several lines match equally near.\n' +
    '  • `trailingAnchor` is optional *additional* evidence, never a second required' +
    '    field: the leading anchor is always present on its own, and an edit that omits' +
    '    it behaves exactly as before. When it is supplied, the' +
    '    line at `startLine + count - 1` has to match it (exact, then ignoring' +
    '    surrounding whitespace, then with a copied `read_file` prefix stripped) before' +
    '    anything is written, and relocation only considers ranges whose two endpoints' +
    '    both agree. That pins where the range ends, so a nearer copy of the leading' +
    '    line can no longer be mistaken for the intended start. When the claimed end' +
    '    disagrees but the anchor matches one line either side of it, `count` is' +
    '    corrected by one instead of rejected, and the correction is reported as' +
    '    `countAdjustment`. Evidence that agrees nowhere, or that stays ambiguous' +
    '    between two ranges, rejects the edit without writing.\n' +
    '  • A whitespace-only `leadingAnchor` matches only at the hinted line; it is never' +
    '    relocated. A blank `trailingAnchor` carries no evidence and is ignored.\n' +
    '  • Only the first line of an anchor is used, and a copied `read_file` prefix' +
    '    (`<n>\\\\t`) is ignored, even when its line number is stale — but only' +
    '    after an exact match against the anchor as sent has had its chance at' +
    '    the hinted line, so content that legitimately opens with digits and a' +
    '    tab is never relocated.\\n' +
    '  • The anchored range must not extend past the end of the file.\n' +
    '  • `replacement` may span multiple lines separated by `\\n`, or be empty to delete' +
    '    the range. A trailing `\\n` in `replacement` is a separator and is dropped.\n' +
    "  • The file's original line ending and trailing-newline state are preserved.\n" +
    '  • If `replacement` begins or ends with lines that exactly duplicate the file' +
    '    lines immediately adjacent to the replaced range (misaligned context from a' +
    '    diff-style hunk), those duplicate lines are dropped and reported as' +
    '    `duplicatesRemoved` and `duplicatedSeamLines`. If you actually intended' +
    '    those duplicates, re-send the edit with the range adjusted to include them.',
  inputSchema,
  outputSchema,

  requiresApproval: () => true,

  handle: handleReplaceInFile,

  formatArguments({ filePath, range, replacement }) {
    const lines = replacement.split('\n');
    const formattedReplacement =
      lines.length > MAX_SHOWN_LINES
        ? `...${lines.slice(-MAX_SHOWN_LINES).join('\n')}`
        : lines.join('\n');

    return `Editing ${describeRange(range.lineNumber, range.count)} in \`${path.basename(filePath)}\`:\n\n\`\`\`\n${formattedReplacement}\n\`\`\``;
  },

  inputToString({ filePath, range }) {
    return `Editing ${describeRange(range.lineNumber, range.count)} in \`${path.basename(filePath)}\``;
  },

  outputToString(
    { filePath, duplicatedSeamLines, countAdjustment },
    _,
    { previous, current }
  ) {
    const fileName = path.basename(filePath);
    const repairNote =
      duplicatedSeamLines.length > 0
        ? `\n\nDropped ${duplicatedSeamLines.length} duplicated seam line(s) from` +
          ` \`replacement\`:\n\`\`\`\n${duplicatedSeamLines.join('\n')}\n\`\`\`\n` +
          'If these were intentional, re-send the edit with the range adjusted to' +
          ' include them.'
        : '';
    const adjustmentNote =
      countAdjustment === 0
        ? ''
        : `\n\n\`count\` was ${countAdjustment === 1 ? 'one short' : 'one long'};` +
          ' corrected against `trailingAnchor`.';
    return `Edited \`${fileName}\`\n\n${formatDiffMd(previous, current)}${repairNote}${adjustmentNote}`;
  },
});

function describeRange(lineNumber: number, count: number): string {
  return count === 1
    ? `line ${lineNumber}`
    : `lines ${lineNumber}-${lineNumber + count - 1}`;
}

async function handleReplaceInFile({
  filePath,
  range: { lineNumber, leadingAnchor, trailingAnchor, count },
  replacement,
}: z.infer<typeof inputSchema>) {
  const {
    agent: {
      agent: { fileCache },
    },
    fileSystem: { cwd },
  } = store.getState();
  const absolutePath = path.resolve(cwd, filePath);

  if (!(await existsAsync(absolutePath))) {
    return Result.Error(`No file exists at \`${absolutePath}\`.`);
  }

  const original = await readFile(absolutePath, 'utf-8');
  const newline = detectLineEnding(original);
  const hadTrailingNewline = TRAILING_LINE_BREAK.test(original);
  const lines = original.split(LINE_BREAK);
  if (hadTrailingNewline) lines.pop();

  const located = locateRange(lines, {
    hintLine: lineNumber,
    leadingAnchor,
    trailingAnchor,
    count,
  });
  if (!located.ok) return Result.Error(located.error);

  const { startLine, countAdjustment } = located.data;
  const effectiveCount = count + countAdjustment;
  const endLine = startLine + effectiveCount - 1;

  const trimmed = trimDuplicatedSeams(
    lines,
    startLine,
    endLine,
    splitReplacement(replacement)
  );

  lines.splice(startLine - 1, effectiveCount, ...trimmed.replacementLines);

  let updated = lines.join(newline);
  if (hadTrailingNewline && isNonEmptyArray(lines)) {
    updated += newline;
  }
  await writeFile(absolutePath, updated, 'utf-8');
  await fileCache.update(absolutePath);

  return Result.Ok(
    {
      startLine,
      linesRemoved: effectiveCount,
      countAdjustment,
      linesInserted: trimmed.replacementLines.length,
      duplicatesRemoved: trimmed.duplicatesRemoved,
      duplicatedSeamLines: trimmed.duplicatedLines,
      filePath,
    },
    {
      previous: original,
      current: updated,
    }
  );
}

function splitReplacement(replacement: string): string[] {
  if (isEmptyString(replacement)) return [];

  const lines = replacement.split(LINE_BREAK);
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
}

/** The endpoints and span of one edit, as the caller described them. */
interface RangeQuery {
  hintLine: number;
  leadingAnchor: string;
  trailingAnchor: string | undefined;
  count: number;
}

/** How strongly a file line agrees with an anchor, strongest evidence first. */
type AnchorStrength = 'exact' | 'whitespace' | 'stale-prefix';

const ANCHOR_STRENGTH_RANK: Record<AnchorStrength, number> = {
  exact: 0,
  whitespace: 1,
  'stale-prefix': 2,
};

/** An anchor reduced to the forms a single file line can agree with it. */
interface AnchorEvidence {
  /** The anchor's first line, minus a `read_file` prefix when it was current. */
  anchor: string;
  /** `anchor` without its surrounding whitespace. */
  trimmed: string;
  /** `anchor` minus a copied `read_file` `<n>\t` prefix, when it carried one. */
  withoutPrefix: string | null;
}

/** A line that agrees with `leadingAnchor`, scored by how near the hint it sits. */
interface LeadingMatch {
  startLine: number;
  strength: AnchorStrength;
  distance: number;
}

/** A range the endpoints corroborate, scored like its leading match. */
interface RangeCandidate extends LeadingMatch {
  endLine: number;
  countAdjustment: 0 | 1 | -1;
}

/** One span of lines the trailing anchor corroborates at a start line. */
interface SpanOption {
  endLine: number;
  countAdjustment: 0 | 1 | -1;
}

/** Where an edit will land, plus any `count` correction the endpoints forced. */
interface LocatedRange {
  startLine: number;
  countAdjustment: 0 | 1 | -1;
}

/**
 * Resolves the first line of the range from its endpoints.
 *
 * The hinted line wins when it matches — first against the anchor exactly as
 * sent, before any `read_file` prefix is stripped — otherwise the nearest exact
 * match, then the nearest whitespace-insensitive match, so that edits planned
 * from a read made before earlier edits still land on the intended line.
 *
 * A trailing anchor, when supplied, is independent evidence about where the
 * range ends rather than a second name for its start. Relocation therefore only
 * offers ranges whose end line agrees with it, which is what keeps a nearer copy
 * of a repeated leading line from being mistaken for the intended start. A
 * claimed end that disagrees gets one bounded chance: when the anchor matches
 * exactly one line either side of it, `count` is corrected by that much and the
 * correction is reported; agreement on both sides leaves the span undecidable
 * and is reported. An edit whose endpoints agree nowhere is reported rather
 * than written.
 *
 * Without a trailing anchor nothing is filtered up front: the nearest leading
 * match is chosen first, and only then is its span checked against the file
 * length — the pre-`trailingAnchor` behavior, unchanged.
 */
function locateRange(lines: string[], query: RangeQuery): Result<LocatedRange> {
  const leading = toEvidence(
    normalizeAnchor(query.leadingAnchor, query.hintLine)
  );
  const trailing = resolveTrailingAnchor(query);
  const endOffset = query.count - 1;

  // A blank leading anchor describes no content, so the only line it can confirm
  // is the hinted one; relocating it would guess the range instead of match it.
  const blankLeading = isEmptyString(leading.trimmed);
  const stalePrefix = uniqueStalePrefix(lines, leading);

  const leadingMatches: LeadingMatch[] = [];
  const candidates: RangeCandidate[] = [];
  const pastEnd: number[] = [];

  lines.forEach((line, index) => {
    const startLine = index + 1;
    const isHinted = startLine === query.hintLine;

    // The anchor as the caller sent it outranks every normalized form, so a
    // line that legitimately opens with digits and a tab is never mistaken for
    // a copied `read_file` prefix and relocated to the line holding the
    // stripped content — the pre-normalization behavior, unchanged.
    const strength =
      isHinted && line === query.leadingAnchor
        ? 'exact'
        : blankLeading
          ? isHinted && isEmptyString(line.trim())
            ? 'exact'
            : null
          : leadingStrength(line, leading, stalePrefix);
    if (isNil(strength)) return;

    const match: LeadingMatch = {
      startLine,
      strength,
      distance: Math.abs(startLine - query.hintLine),
    };
    leadingMatches.push(match);

    // Without a trailing anchor the original behavior applies: every leading
    // match is a candidate, the nearest one is chosen first, and only then is
    // the chosen range checked against the file length — so a farther match
    // that fits is never edited in place of a nearer one that overruns.
    if (isNil(trailing)) {
      candidates.push({
        ...match,
        endLine: startLine + endOffset,
        countAdjustment: 0,
      });
      return;
    }

    const spans = spanOptions(startLine, query.count, lines, trailing);
    if (isNonEmptyArray(spans)) {
      spans.forEach(span =>
        candidates.push({
          ...match,
          endLine: span.endLine,
          countAdjustment: span.countAdjustment,
        })
      );
      return;
    }

    if (startLine + endOffset > lines.length) pastEnd.push(startLine);
  });

  if (isNonEmptyArray(candidates)) {
    const chosen = selectCandidate(candidates, query, trailing);
    if (!chosen.ok) return chosen;

    // The file-length check runs after the nearest match is chosen, exactly as
    // it did before `trailingAnchor` existed.
    if (isNil(trailing) && chosen.data.endLine > lines.length)
      return Result.Error(
        describeOverrun(lines, [chosen.data.startLine], query)
      );

    return Result.Ok({
      startLine: chosen.data.startLine,
      countAdjustment: chosen.data.countAdjustment,
    });
  }
  if (isEmptyArray(leadingMatches)) {
    return Result.Error(
      blankLeading
        ? describeBlankAnchor(lines, query)
        : describeMissingLeadingAnchor(lines, query)
    );
  }
  if (pastEnd.length === leadingMatches.length) {
    return Result.Error(describeOverrun(lines, pastEnd, query));
  }

  // A leading match fits the file, so only the trailing endpoint can have ruled
  // every candidate range out.
  return Result.Error(describeDisagreement(lines, leadingMatches, query));
}

/**
 * Chooses the range the endpoints point at, or reports why they cannot decide.
 * An exactly corroborated span beats any inferred one, then the hinted line,
 * then the strongest agreement with `leadingAnchor`, then the closest one.
 */
function selectCandidate(
  candidates: NonEmptyArray<RangeCandidate>,
  query: RangeQuery,
  trailing: AnchorEvidence | null
): Result<RangeCandidate> {
  candidates.sort(compareCandidates);
  const best = candidates[0];

  const equallyGood = candidates.filter(
    candidate => compareCandidates(candidate, best) === 0
  );
  if (equallyGood.length > 1)
    return Result.Error(describeAmbiguity(equallyGood, query, trailing));

  return Result.Ok(best);
}

/**
 * The spans `count` could describe at `startLine`: the claimed one when its end
 * agrees with the trailing anchor, otherwise — the bounded repair for a
 * miscount — a span one line shorter or longer whose end agrees. Agreement on
 * both sides yields both, leaving the span undecidable for `selectCandidate`.
 */
function spanOptions(
  startLine: number,
  count: number,
  lines: string[],
  trailing: AnchorEvidence
): SpanOption[] {
  const claimedEnd = startLine + count - 1;
  if (
    claimedEnd <= lines.length &&
    endpointAgrees(lines[claimedEnd - 1], trailing)
  ) {
    return [{ endLine: claimedEnd, countAdjustment: 0 }];
  }

  const options: SpanOption[] = [];
  for (const adjustment of [-1, 1] as const) {
    const adjustedCount = count + adjustment;
    if (adjustedCount < 1) continue;

    const endLine = startLine + adjustedCount - 1;
    if (endLine > lines.length) continue;
    if (!endpointAgrees(lines[endLine - 1], trailing)) continue;
    options.push({ endLine, countAdjustment: adjustment });
  }
  return options;
}

/**
 * Preferred order for two ranges the endpoints agree on: an exactly
 * corroborated span beats one inferred from an off-by-one trailing anchor, the
 * hinted line beats any relocation, then the strongest agreement, then the
 * closest one.
 */
function compareCandidates(a: RangeCandidate, b: RangeCandidate): number {
  const byCorroboration =
    Math.abs(a.countAdjustment) - Math.abs(b.countAdjustment);
  if (byCorroboration !== 0) return byCorroboration;

  return compareLeadingMatches(a, b);
}

function compareLeadingMatches(a: LeadingMatch, b: LeadingMatch): number {
  const byHint = (a.distance === 0 ? 0 : 1) - (b.distance === 0 ? 0 : 1);
  if (byHint !== 0) return byHint;

  const byStrength =
    ANCHOR_STRENGTH_RANK[a.strength] - ANCHOR_STRENGTH_RANK[b.strength];
  if (byStrength !== 0) return byStrength;

  return a.distance - b.distance;
}

/** How strongly `line` agrees with the anchor naming the start of the range. */
function leadingStrength(
  line: string,
  anchor: AnchorEvidence,
  stalePrefix: string | null
): AnchorStrength | null {
  if (line === anchor.anchor) return 'exact';
  if (line.trim() === anchor.trimmed) return 'whitespace';
  if (isNotNil(stalePrefix) && line === stalePrefix) return 'stale-prefix';
  return null;
}

/**
 * Whether `line` corroborates the anchor naming the end of the range.
 *
 * The same agreements the leading anchor accepts: exact, ignoring surrounding
 * whitespace, and — for a pasted `read_file` prefix — the content underneath it.
 * Here they judge one known line rather than choose between candidates, so a
 * stripped prefix needs no uniqueness guard of its own.
 */
function endpointAgrees(
  line: string | undefined,
  anchor: AnchorEvidence
): boolean {
  if (isNil(line)) return false;

  const forms = isNotNil(anchor.withoutPrefix)
    ? [anchor.anchor, anchor.withoutPrefix]
    : [anchor.anchor];

  return forms.some(form => line === form || line.trim() === form.trim());
}

/**
 * Models often paste several lines, or the `<n>\t` prefix `read_file` prints,
 * as an anchor; neither can ever equal a single file line. The prefix is only
 * stripped when it names the line the anchor is expected to sit on, so a stale
 * copy survives for `toEvidence` to repair as a last resort. Stripping happens
 * only after an exact match against the anchor as sent has had its chance at
 * the hinted line, so content that legitimately opens with digits and a tab is
 * never rewritten onto an unrelated line.
 */
function normalizeAnchor(anchor: string, lineNumber: number): string {
  const [firstLine = ''] = anchor.split(LINE_BREAK);
  const readFilePrefix = `${lineNumber}\t`;
  const unpadded = firstLine.trimStart();

  return unpadded.startsWith(readFilePrefix)
    ? unpadded.slice(readFilePrefix.length)
    : firstLine;
}

function toEvidence(anchor: string): AnchorEvidence {
  const withoutPrefix = anchor.replace(READ_FILE_PREFIX, '');

  return {
    anchor,
    trimmed: anchor.trim(),
    withoutPrefix:
      withoutPrefix === anchor || isEmptyString(withoutPrefix)
        ? null
        : withoutPrefix,
  };
}

/**
 * Last-resort repair for an anchor copied from an older `read_file` whose
 * `<n>\t` prefix no longer matches the hinted line number. Only a form that is
 * exact and unique in the whole file qualifies, so content that legitimately
 * opens with digits and a tab can never be rewritten onto an unrelated line.
 */
function uniqueStalePrefix(
  lines: string[],
  anchor: AnchorEvidence
): string | null {
  const target = anchor.withoutPrefix;
  if (isNil(target)) return null;

  return lines.filter(line => line === target).length === 1 ? target : null;
}

/**
 * The trailing anchor as endpoint evidence, or null when there is nothing to
 * check: an omitted anchor, or a blank one, says nothing about where the range
 * ends. Its copied `read_file` prefix is stripped against the line the range is
 * claimed to end on, so a pasted `<n>\t` is ignored the same way the leading
 * anchor ignores it.
 */
function resolveTrailingAnchor(query: RangeQuery): AnchorEvidence | null {
  if (isNil(query.trailingAnchor)) return null;

  const anchor = normalizeAnchor(
    query.trailingAnchor,
    query.hintLine + query.count - 1
  );
  return isEmptyString(anchor.trim()) ? null : toEvidence(anchor);
}

function describeOverrun(
  lines: string[],
  pastEnd: number[],
  query: RangeQuery
): string {
  const nearest = pastEnd.reduce((best, line) =>
    Math.abs(line - query.hintLine) < Math.abs(best - query.hintLine)
      ? line
      : best
  );

  return (
    `Range starting at line ${nearest} with \`count\` ${query.count} exceeds file` +
    ` length (${lines.length} line(s)).`
  );
}

function describeBlankAnchor(lines: string[], query: RangeQuery): string {
  const hinted = lines[query.hintLine - 1];
  const reason = isNil(hinted)
    ? `line ${query.hintLine} is out of range: the file has only ${lines.length} line(s)`
    : `line ${query.hintLine} does not match the blank \`leadingAnchor\``;

  return (
    `A blank \`leadingAnchor\` cannot be relocated (${reason}). Re-read the file and` +
    ' anchor on a non-blank line.'
  );
}

function describeMissingLeadingAnchor(
  lines: string[],
  query: RangeQuery
): string {
  const hinted = lines[query.hintLine - 1];
  const found = isNil(hinted)
    ? `the file has only ${lines.length} line(s)`
    : `line ${query.hintLine} is \`${hinted}\``;

  return (
    `No line matches \`leadingAnchor\` (${found}). The file may have changed; re-read` +
    ' it and retry.'
  );
}

function describeAmbiguity(
  candidates: RangeCandidate[],
  query: RangeQuery,
  trailing: AnchorEvidence | null
): string {
  const startLines = [...new Set(candidates.map(c => c.startLine))];
  const matched = startLines.join(', ');

  return startLines.length === 1
    ? `\`trailingAnchor\` agrees one line either side of the range \`count\` ${query.count} closes on at line ${matched}, so the range length is ambiguous. Re-read the file and fix \`count\`.`
    : `\`leadingAnchor\` is ambiguous: lines ${matched} match and are equally near line ${query.hintLine}${
        isNotNil(trailing)
          ? ', and `trailingAnchor` agrees at every one of them'
          : ''
      }. Re-read the file and anchor on a line that is unique in the file.`;
}

function describeDisagreement(
  lines: string[],
  leadingMatches: LeadingMatch[],
  query: RangeQuery
): string {
  const startLine =
    [...leadingMatches].sort(compareLeadingMatches)[0]?.startLine ??
    query.hintLine;
  const endLine = startLine + query.count - 1;

  return (
    `The endpoints of this range disagree: \`leadingAnchor\` matches at line` +
    ` ${startLine}, but the line \`count\` ${query.count} ends that range on — line` +
    ` ${endLine}, which is \`${lines[endLine - 1] ?? ''}\` — does not agree with` +
    ' `trailingAnchor`, not even one line either side of it, and no other range' +
    ' whose first line matches `leadingAnchor` has endpoints that agree. Re-read' +
    ' the file and fix the anchors or `count`.'
  );
}

/**
 * Drops leading/trailing replacement lines that repeat the file lines just
 * outside the replaced range, as happens when a model sends a diff-style hunk
 * with context. Only seams containing a letter or digit count: a lone `}` or
 * blank line matching its neighbour is as likely intentional as accidental.
 * Nothing is trimmed if that would empty the replacement, since that would
 * silently turn the edit into a deletion.
 */
function trimDuplicatedSeams(
  lines: string[],
  startLine: number,
  endLine: number,
  replacementLines: string[]
): {
  replacementLines: string[];
  duplicatesRemoved: number;
  duplicatedLines: string[];
} {
  const linesAbove = lines.slice(0, startLine - 1);
  const linesBelow = lines.slice(endLine);

  const leading = findLongestSeam(
    replacementLines.length,
    linesAbove.length,
    k => linesEqual(replacementLines.slice(0, k), linesAbove.slice(-k))
  );
  const trailing = findLongestSeam(
    replacementLines.length,
    linesBelow.length,
    k => linesEqual(replacementLines.slice(-k), linesBelow.slice(0, k))
  );

  const leadingTrim = isSignificantSeam(replacementLines.slice(0, leading))
    ? leading
    : 0;
  const trailingTrim = isSignificantSeam(
    replacementLines.slice(replacementLines.length - trailing)
  )
    ? trailing
    : 0;

  if (leadingTrim + trailingTrim >= replacementLines.length) {
    return { replacementLines, duplicatesRemoved: 0, duplicatedLines: [] };
  }

  return {
    replacementLines: replacementLines.slice(
      leadingTrim,
      replacementLines.length - trailingTrim
    ),
    duplicatesRemoved: leadingTrim + trailingTrim,
    duplicatedLines: [
      ...replacementLines.slice(0, leadingTrim),
      ...replacementLines.slice(replacementLines.length - trailingTrim),
    ],
  };
}

function isSignificantSeam(seam: string[]): boolean {
  return seam.some(line => /[\p{L}\p{N}]/u.test(line));
}

function findLongestSeam(
  replacementLength: number,
  contextLength: number,
  matchesAt: (seamLength: number) => boolean
): number {
  for (
    let seamLength = Math.min(replacementLength, contextLength);
    seamLength > 0;
    seamLength--
  ) {
    if (matchesAt(seamLength)) return seamLength;
  }
  return 0;
}

function linesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}
