import * as path from 'node:path';
import type { ModelMessage } from 'ai';

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
 * - **Stale**: a read that predates an edit (`replace_in_file`) or
 *   (over)write (`create_file`) of the same file is elided — its line numbers
 *   and contents no longer match disk.
 *
 * The stored history is never mutated; compaction is applied copy-on-write to a
 * fresh array each turn, so a read that is later re-read or re-edited is
 * elided only from the point where that happens.
 */
export class ContextStore {
  private readonly _messages: ModelMessage[] = [];

  /** @param cwd Working directory used to normalise tool paths before matching. */
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

  /** Number of stored messages. */
  public get size(): number {
    return this._messages.length;
  }

  /** The raw, uncompacted history. Exposed for inspection and testing. */
  public get messages(): readonly ModelMessage[] {
    return this._messages;
  }

  /**
   * The message list to send to the model this turn, with superseded and stale
   * file reads elided. Returns a shallow copy; only the messages that carry an
   * elided read are cloned.
   */
  public materialize(): ModelMessage[] {
    const reads: ReadRef[] = [];
    const mutations: MutationRef[] = [];
    const callInputs = this.collectCallInputs();

    this._messages.forEach((message, messageIndex) => {
      if (message.role !== 'tool' || !Array.isArray(message.content)) return;

      message.content.forEach((part, partIndex) => {
        const read = getReadData(part);
        if (read !== undefined) {
          const interval = parseInterval(read.content);
          if (interval !== undefined) {
            reads.push({
              messageIndex,
              partIndex,
              path: this.normalise(read.filePath),
              ...interval,
            });
          }
          return;
        }

        const mutatedPath = getMutationPath(part, callInputs);
        if (mutatedPath !== undefined) {
          mutations.push({
            messageIndex,
            path: this.normalise(mutatedPath),
          });
        }
      });
    });

    const toElide = this.selectElidableReads(reads, mutations);
    if (toElide.length === 0) return [...this._messages];

    return this.withStubs(toElide);
  }

  private collectCallInputs(): Map<string, unknown> {
    const inputs = new Map<string, unknown>();
    for (const message of this._messages) {
      if (message.role !== 'assistant' || !Array.isArray(message.content)) {
        continue;
      }
      for (const part of message.content) {
        if (part.type === 'tool-call') {
          inputs.set(part.toolCallId, part.input);
        }
      }
    }
    return inputs;
  }

  /**
   * Returns the reads to elide, each with the reason (for the stub text).
   */
  private selectElidableReads(
    reads: ReadRef[],
    mutations: MutationRef[]
  ): Elision[] {
    const elide: Elision[] = [];

    for (const read of reads) {
      const editedAfter = mutations.some(
        mutation =>
          mutation.path === read.path &&
          mutation.messageIndex > read.messageIndex
      );
      if (editedAfter) {
        elide.push({ read, reason: 'stale' });
        continue;
      }

      const supersededBy = reads.some(
        other =>
          other !== read &&
          other.path === read.path &&
          other.messageIndex > read.messageIndex &&
          other.start <= read.start &&
          other.end >= read.end
      );
      if (supersededBy) {
        elide.push({ read, reason: 'superseded' });
      }
    }

    return elide;
  }

  private withStubs(toElide: Elision[]): ModelMessage[] {
    const result = [...this._messages];
    const cloned = new Set<number>();

    for (const { read: ref, reason } of toElide) {
      const base = result[ref.messageIndex];
      if (base === undefined || !Array.isArray(base.content)) continue;

      // Clone the message and its content array once, then edit that array in
      // place for any further elisions targeting the same message.
      let content: unknown[];
      if (cloned.has(ref.messageIndex)) {
        content = base.content;
      } else {
        content = [...(base.content as unknown[])];
        result[ref.messageIndex] = { ...base, content } as ModelMessage;
        cloned.add(ref.messageIndex);
      }

      const part = content[ref.partIndex];
      const read = getReadData(part);
      if (read === undefined) continue;

      content[ref.partIndex] = this.stubRead(part, read, reason);
    }

    return result;
  }

  private stubRead(
    part: unknown,
    read: ReadOutputData,
    reason: ElisionReason
  ): unknown {
    const interval = parseInterval(read.content);
    const range =
      interval === undefined ? '' : ` lines ${interval.start}-${interval.end}`;
    const relative = path.relative(this.cwd, this.normalise(read.filePath));
    const explanation =
      reason === 'stale'
        ? 'the file was modified after this read; re-read for current contents'
        : 'a later read of this file supersedes it';

    const stub = `[read_file ${relative}${range}] Contents elided — ${explanation}.`;

    // Copy-on-write down to the single string we change, leaving every other
    // reference shared with the stored history.
    const typed = part as ToolResultPartLike;
    return {
      ...typed,
      output: {
        ...typed.output,
        value: {
          ...(typed.output.value as object),
          data: { ...read, content: stub },
        },
      },
    };
  }

  private normalise(filePath: string): string {
    return path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.resolve(this.cwd, filePath);
  }
}

type ElisionReason = 'stale' | 'superseded';

interface Elision {
  read: ReadRef;
  reason: ElisionReason;
}

interface ReadRef {
  messageIndex: number;
  partIndex: number;
  path: string;
  start: number;
  end: number;
}

interface MutationRef {
  messageIndex: number;
  path: string;
}

interface ReadOutputData {
  filePath: string;
  content: string;
}

interface ToolResultPartLike {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: { type: string; value: unknown };
}

const READ_TOOL = 'read_file';
const MUTATING_TOOLS = new Set(['replace_in_file', 'create_file']);

function isToolResultPart(part: unknown): part is ToolResultPartLike {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'tool-result'
  );
}

/**
 * Extracts `{ filePath, content }` from a `read_file` tool-result part, or
 * `undefined` for any other part. `read_file` returns `Result.Ok({ content,
 * filePath })`, which the SDK wraps as `output: { type: 'json', value: { ok,
 * data } }`.
 */
function getReadData(part: unknown): ReadOutputData | undefined {
  if (!isToolResultPart(part) || part.toolName !== READ_TOOL) return undefined;
  return readDataOf(part);
}

function readDataOf(part: ToolResultPartLike): ReadOutputData | undefined {
  if (part.output.type !== 'json') return undefined;
  const value = part.output.value;
  if (typeof value !== 'object' || value === null) return undefined;

  const data = (value as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return undefined;

  const { filePath, content } = data as Record<string, unknown>;
  if (typeof filePath === 'string' && typeof content === 'string') {
    return { filePath, content };
  }
  return undefined;
}

/**
 * Resolves the file path a mutating tool (`replace_in_file` / `create_file`)
 * acted on, preferring the result payload and falling back to the originating
 * tool-call's arguments (`create_file` reports only `success`).
 */
function getMutationPath(
  part: unknown,
  callInputs: Map<string, unknown>
): string | undefined {
  if (!isToolResultPart(part) || !MUTATING_TOOLS.has(part.toolName)) {
    return undefined;
  }

  if (part.output.type === 'json') {
    const data = (part.output.value as { data?: unknown } | null)?.data;
    const fromResult = (data as { filePath?: unknown } | undefined)?.filePath;
    if (typeof fromResult === 'string') return fromResult;
  }

  const input = callInputs.get(part.toolCallId) as
    | { path?: unknown; filePath?: unknown }
    | undefined;
  if (typeof input?.path === 'string') return input.path;
  if (typeof input?.filePath === 'string') return input.filePath;
  return undefined;
}

/**
 * Reads the first and last line numbers printed by `read_file`'s
 * `<n>\t<line>` prefix, giving the inclusive range the content covers. Returns
 * `undefined` when the content is not line-numbered.
 */
function parseInterval(
  content: string
): { start: number; end: number } | undefined {
  const lines = content.split(/\r?\n/);
  const first = lines[0]?.match(/^\s*(\d+)\t/);
  if (first === null || first === undefined) return undefined;

  const start = Number(first[1]);
  let end = start;
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i]?.match(/^\s*(\d+)\t/);
    if (match) {
      end = Number(match[1]);
      break;
    }
  }
  return { start, end };
}
