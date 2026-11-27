import {
  isEmptyArray,
  isEmptyString,
  isNil,
  isNonEmptyArray,
  isNotNil,
  type NonEmptyArray,
} from '@vxti/typed';
import { Result } from '../../../../result';
import { LINE_BREAK } from '../../../../utils/string-utils';

const READ_FILE_PREFIX = /^\s*\d+\t/;

/** The endpoints and span of one edit, as the caller described them. */
export interface RangeQuery {
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
export interface LocatedRange {
  startLine: number;
  countAdjustment: 0 | 1 | -1;
}

/** The `leadingAnchor` reduced to everything a file line is judged against. */
interface LeadingResolution {
  /** The anchor as the caller sent it, which outranks every normalized form. */
  raw: string;
  hintLine: number;
  anchor: AnchorEvidence;
  /** Whether the anchor describes no content, so only the hinted line confirms it. */
  blank: boolean;
  /** The stripped form of a stale copied `read_file` prefix, when it is unique. */
  stalePrefix: string | null;
}

/** The replacement lines that survive the seam repair, and what it dropped. */
export interface TrimmedReplacement {
  replacementLines: string[];
  duplicatesRemoved: number;
  duplicatedLines: string[];
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
export function locateRange(
  lines: string[],
  query: RangeQuery
): Result<LocatedRange> {
  const resolution = resolveLeading(lines, query);
  const trailing = resolveTrailingAnchor(query);
  const endOffset = query.count - 1;

  const leadingMatches: LeadingMatch[] = [];
  const candidates: RangeCandidate[] = [];
  const pastEnd: number[] = [];

  lines.forEach((line, index) => {
    const startLine = index + 1;

    const strength = resolveLeadingStrength(line, startLine, resolution);
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
      resolution.blank
        ? describeBlankAnchor(lines, query)
        : describeMissingLeadingAnchor(lines, query)
    );
  }
  if (pastEnd.length === leadingMatches.length) {
    return Result.Error(describeOverrun(lines, pastEnd, query));
  }

  // A leading match fits the file, so only the trailing endpoint can have ruled
  // every candidate range out.
  return Result.Error(
    describeDisagreement(lines, leadingMatches, pastEnd, query)
  );
}

/**
 * Reduces `leadingAnchor` to the forms a file line can agree with it, keeping
 * the anchor as sent alongside them so the raw match is never outranked by its
 * own normalization.
 */
function resolveLeading(lines: string[], query: RangeQuery): LeadingResolution {
  const anchor = toEvidence(
    normalizeAnchor(query.leadingAnchor, query.hintLine)
  );

  return {
    raw: query.leadingAnchor,
    hintLine: query.hintLine,
    anchor,
    // A blank leading anchor describes no content, so the only line it can
    // confirm is the hinted one; relocating it would guess the range instead of
    // match it.
    blank: isEmptyString(anchor.trimmed),
    stalePrefix: uniqueStalePrefix(lines, anchor),
  };
}

/**
 * How strongly `line` names the start of the range.
 *
 * The anchor as the caller sent it is tried against the hinted line first,
 * before any `read_file` prefix is stripped, so content that legitimately opens
 * with digits and a tab is never mistaken for a stale prefix and relocated to
 * the line holding the stripped content — the pre-normalization behavior,
 * unchanged.
 */
function resolveLeadingStrength(
  line: string,
  startLine: number,
  resolution: LeadingResolution
): AnchorStrength | null {
  const hinted = startLine === resolution.hintLine;

  if (hinted && line === resolution.raw) return 'exact';
  if (resolution.blank)
    return hinted && isEmptyString(line.trim()) ? 'exact' : null;

  return leadingStrength(line, resolution.anchor, resolution.stalePrefix);
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
  pastEnd: number[],
  query: RangeQuery
): string {
  const startLine =
    [...leadingMatches].sort(compareLeadingMatches)[0]?.startLine ??
    query.hintLine;
  const endLine = startLine + query.count - 1;

  // A leading match whose own span cannot fit the file corroborates no endpoint
  // either, so the report says which of the two ruled it out.
  const overrun = isNonEmptyArray(pastEnd)
    ? ` Some matches of \`leadingAnchor\` overrun the file and so corroborate no` +
      ` span either: ${describeOverrun(lines, pastEnd, query)}`
    : '';

  const mismatch =
    `The endpoints of this range disagree: \`leadingAnchor\` matches at line` +
    ` ${startLine}, but the line \`count\` ${query.count} ends that range on — line` +
    ` ${endLine}, which is \`${lines[endLine - 1] ?? ''}\` — does not agree with` +
    ' `trailingAnchor`, not even one line either side of it, and no other range' +
    ' whose first line matches `leadingAnchor` has endpoints that agree.';

  return `${mismatch}${overrun} Re-read the file and fix the anchors or \`count\`.`;
}

/**
 * Drops leading/trailing replacement lines that repeat the file lines just
 * outside the replaced range, as happens when a model sends a diff-style hunk
 * with context. Only seams containing a letter or digit count: a lone `}` or
 * blank line matching its neighbour is as likely intentional as accidental.
 * Nothing is trimmed if that would empty the replacement, since that would
 * silently turn the edit into a deletion.
 */
export function trimDuplicatedSeams(
  lines: string[],
  startLine: number,
  endLine: number,
  replacementLines: string[]
): TrimmedReplacement {
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
