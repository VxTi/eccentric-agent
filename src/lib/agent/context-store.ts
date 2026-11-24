import * as path from 'node:path';
import { isNil, isNotNil } from '@vxti/typed';
import type { ModelMessage, ToolResultPart } from 'ai';

/**
 * Owns the model-facing message history and keeps file content from clobbering
 * the context window.
 *
 * File bodies enter the context as `read_file` tool results. Without
 * intervention, re-reading a file — or reading it before editing it — leaves
 * several full copies in the history, most of them stale. {@link materialize}
 * returns a compacted view in which those redundant copies are collapsed to a
 * short stub, keeping exactly one authoritative copy of each region:
 *
 * - **Superseded**: an earlier read whose line range is fully covered by a
 *   later read of the same file is elided (the later, broader copy wins).
 * - **Stale**: a read that predates a successful edit (`replace_in_file`) or
 *   (over)write (`create_file`) of the same file is elided — its line numbers
 *   and contents no longer match disk.
 *
 * The stored history is never mutated; compaction is copy-on-write, so a read
 * that is later re-read or re-edited is elided only from the point where that
 * happens.
 */
export class ContextStore {
  private readonly _messages: ModelMessage[] = [];

  /**
   * Stored tool-result parts never change, and the SDK carries the same part
   * objects into every step, so each part is parsed once rather than per step.
   */
  private readonly _fileReadByPart = new WeakMap<
    ToolResultPart,
    FileRead | undefined
  >();

  /** @param cwd Working directory used to resolve tool paths before matching. */
  public constructor(private readonly cwd: string) {}

  public pushUser(content: string): void {
    this._messages.push({ role: 'user', content });
  }

  public pushResponse(messages: readonly ModelMessage[]): void {
    this._messages.push(...messages);
  }

  public clear(): void {
    this._messages.length = 0;
  }

  public get size(): number {
    return this._messages.length;
  }

  /** The raw, uncompacted history. */
  public get messages(): readonly ModelMessage[] {
    return this._messages;
  }

  /**
   * The message list to send to the model for a step, with superseded and
   * stale file reads replaced by stubs. Accepts any message list — including
   * one already carrying responses and stubs from earlier steps of the same
   * turn — so it can run before every step.
   *
   * The input is returned as-is when nothing needs eliding; otherwise a shallow
   * copy in which only the messages holding an elided read are cloned. Called
   * without arguments it works on a copy of the stored history.
   */
  public materialize(
    messages: ModelMessage[] = [...this._messages]
  ): ModelMessage[] {
    const elisions = findElisions(this.collectFileEvents(messages));
    if (elisions.length === 0) return messages;
    return this.replaceWithStubs(messages, elisions);
  }

  /** File reads and mutations in conversation order. */
  private collectFileEvents(messages: readonly ModelMessage[]): FileEvent[] {
    const events: FileEvent[] = [];
    const mutationCallInputs = new Map<string, unknown>();

    messages.forEach((message, messageIndex) => {
      if (!Array.isArray(message.content)) return;

      message.content.forEach((part, partIndex) => {
        if (part.type === 'tool-call' && MUTATING_TOOLS.has(part.toolName)) {
          mutationCallInputs.set(part.toolCallId, part.input);
          return;
        }
        if (part.type !== 'tool-result') return;

        const location = { messageIndex, partIndex };
        const read = this.fileReadOf(part);
        if (isNotNil(read)) {
          events.push({ kind: 'read', location, read });
          return;
        }

        const mutatedPath = mutatedPathOf(part, mutationCallInputs);
        if (isNotNil(mutatedPath)) {
          events.push({ kind: 'mutation', path: this.resolve(mutatedPath) });
        }
      });
    });

    return events;
  }

  private fileReadOf(part: ToolResultPart): FileRead | undefined {
    if (this._fileReadByPart.has(part)) return this._fileReadByPart.get(part);

    const payload = readPayloadOf(part);
    const read = isNil(payload)
      ? undefined
      : {
          path: this.resolve(payload.filePath),
          lines: lineRangeOf(payload.content),
          isStub: payload.content.startsWith(STUB_PREFIX),
        };
    this._fileReadByPart.set(part, read);
    return read;
  }

  private replaceWithStubs(
    messages: readonly ModelMessage[],
    elisions: readonly Elision[]
  ): ModelMessage[] {
    const result = [...messages];

    for (const [messageIndex, elided] of groupByMessage(elisions)) {
      const message = messages[messageIndex] as ModelMessage & {
        content: unknown[];
      };
      const content = [...message.content];
      for (const { read, location, reason } of elided) {
        content[location.partIndex] = this.stubFor(
          content[location.partIndex] as ToolResultPart,
          read,
          reason
        );
      }
      result[messageIndex] = { ...message, content } as ModelMessage;
    }

    return result;
  }

  private stubFor(
    part: ToolResultPart,
    read: FileRead,
    reason: ElisionReason
  ): ToolResultPart {
    const range = isNil(read.lines)
      ? ''
      : ` lines ${read.lines.start}-${read.lines.end}`;
    const stub = `${STUB_PREFIX}${path.relative(this.cwd, read.path)}${range}] Contents elided — ${ELISION_EXPLANATIONS[reason]}.`;

    const { output } = part;
    if (output.type !== 'json') return part;
    const value = output.value as { data: object };
    return {
      ...part,
      output: {
        type: 'json',
        value: { ...value, data: { ...value.data, content: stub } },
      },
    };
  }

  private resolve(filePath: string): string {
    return path.resolve(this.cwd, filePath);
  }
}

type ElisionReason = 'stale' | 'superseded';

const ELISION_EXPLANATIONS: Record<ElisionReason, string> = {
  stale: 'the file was modified after this read; re-read for current contents',
  superseded: 'a later read of this file supersedes it',
};

/** Line-numbered `read_file` content never starts with this, so stubs are recognisable. */
const STUB_PREFIX = '[read_file ';

const READ_TOOL = 'read_file';
const MUTATING_TOOLS = new Set(['replace_in_file', 'create_file']);

interface LineRange {
  start: number;
  end: number;
}

interface FileRead {
  path: string;
  /** Absent when the content is not line-numbered, e.g. an existing stub. */
  lines: LineRange | undefined;
  isStub: boolean;
}

interface PartLocation {
  messageIndex: number;
  partIndex: number;
}

type FileEvent =
  | { kind: 'read'; location: PartLocation; read: FileRead }
  | { kind: 'mutation'; path: string };

interface Elision {
  location: PartLocation;
  read: FileRead;
  reason: ElisionReason;
}

/**
 * Walks the events newest-first, so every read is judged against exactly the
 * mutations and reads that follow it: O(events) plus one range scan per read.
 */
function findElisions(events: readonly FileEvent[]): Elision[] {
  const mutatedLater = new Set<string>();
  const laterRanges = new Map<string, LineRange[]>();
  const elisions: Elision[] = [];

  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    if (event.kind === 'mutation') {
      mutatedLater.add(event.path);
      continue;
    }

    const { read, location } = event;
    if (read.isStub) continue;

    const rangesOfFile = getOrInsert(laterRanges, read.path);
    const reason = elisionReasonOf(read, mutatedLater, rangesOfFile);
    if (isNotNil(reason)) elisions.push({ location, read, reason });

    if (isNotNil(read.lines)) rangesOfFile.push(read.lines);
  }

  return elisions;
}

function elisionReasonOf(
  read: FileRead,
  mutatedLater: ReadonlySet<string>,
  laterRanges: readonly LineRange[]
): ElisionReason | undefined {
  if (mutatedLater.has(read.path)) return 'stale';
  const { lines } = read;
  if (isNotNil(lines) && laterRanges.some(range => covers(range, lines))) {
    return 'superseded';
  }
  return undefined;
}

function covers(outer: LineRange, inner: LineRange): boolean {
  return outer.start <= inner.start && outer.end >= inner.end;
}

function groupByMessage(elisions: readonly Elision[]): Map<number, Elision[]> {
  const groups = new Map<number, Elision[]>();
  for (const elision of elisions) {
    getOrInsert(groups, elision.location.messageIndex).push(elision);
  }
  return groups;
}

function getOrInsert<K, V>(map: Map<K, V[]>, key: K): V[] {
  let values = map.get(key);
  if (isNil(values)) {
    values = [];
    map.set(key, values);
  }
  return values;
}

/**
 * `{ data }` of a successful tool result. Tools return `Result`, which the SDK
 * wraps as `output: { type: 'json', value: { ok, data } }`; anything else —
 * a `Result.Error`, a thrown error, a denied call — changed nothing on disk.
 */
function successDataOf(part: ToolResultPart): unknown {
  if (part.output.type !== 'json') return undefined;
  const value = part.output.value as { ok?: unknown; data?: unknown } | null;
  return value?.ok === true ? value.data : undefined;
}

function stringField(source: unknown, key: string): string | undefined {
  if (typeof source !== 'object' || isNil(source)) return undefined;
  const field = (source as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
}

function readPayloadOf(
  part: ToolResultPart
): { filePath: string; content: string } | undefined {
  if (part.toolName !== READ_TOOL) return undefined;
  const data = successDataOf(part);
  const filePath = stringField(data, 'filePath');
  const content = stringField(data, 'content');
  return isNil(filePath) || isNil(content) ? undefined : { filePath, content };
}

/**
 * The path a successful `replace_in_file` / `create_file` acted on: from the
 * result payload, else from the originating call's arguments (`create_file`
 * reports only `success`).
 */
function mutatedPathOf(
  part: ToolResultPart,
  mutationCallInputs: ReadonlyMap<string, unknown>
): string | undefined {
  if (!MUTATING_TOOLS.has(part.toolName)) return undefined;
  const data = successDataOf(part);
  if (isNil(data)) return undefined;

  const input = mutationCallInputs.get(part.toolCallId);
  return (
    stringField(data, 'filePath') ??
    stringField(input, 'path') ??
    stringField(input, 'filePath')
  );
}

const LINE_NUMBER_PREFIX = /^ *(\d+)\t/;

/**
 * The inclusive line range of `read_file` content, whose lines are each
 * prefixed `<n>\t` and numbered consecutively — so the last number follows
 * from the line count without splitting the content.
 */
function lineRangeOf(content: string): LineRange | undefined {
  const first = LINE_NUMBER_PREFIX.exec(content);
  if (isNil(first)) return undefined;
  const start = Number(first[1]);
  return { start, end: start + countLineFeeds(content) };
}

function countLineFeeds(content: string): number {
  let count = 0;
  for (
    let i = content.indexOf('\n');
    i !== -1;
    i = content.indexOf('\n', i + 1)
  ) {
    count++;
  }
  return count;
}
