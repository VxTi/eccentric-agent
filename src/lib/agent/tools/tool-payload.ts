import type { SideBySideDiff } from '../../utils/diff-utils';

/**
 * Structured rendering data a tool may attach to its completion message, so
 * the UI can skip re-deriving it from the flattened `content` string on every
 * parse. Payloads never reach the model: they are built from `Result.metadata`,
 * which `core.ts` strips before the tool result enters the context window.
 */
export type ToolMessageData = DiffMessageData;

export interface DiffMessageData {
  kind: 'diff';
  /** The exact strings `outputToString` embedded in the message content, so
   *  the renderer can confirm a diff block belongs to this payload. */
  previous: string;
  current: string;
  /** Side-by-side rows pre-computed from `previous`/`current` at emit time. */
  rows: SideBySideDiff[];
  language?: string;
}
