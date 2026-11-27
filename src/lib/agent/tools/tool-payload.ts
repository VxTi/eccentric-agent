import type { SideBySideDiff } from '../../utils/diff-utils';

/**
 * Structured rendering data a tool may attach to its completion message, so
 * the UI can skip re-deriving it from the flattened `content` string on every
 * parse. Payloads never reach the model: they are built from `Result`'s
 * `context`, which both `core.ts` and `sub-agent.ts` strip before the tool
 * result enters the context window.
 */
export type ToolMessageData = DiffMessageData;

export interface DiffMessageData {
  kind: 'diff';
  /** The file content before and after the edit; the sole copy the UI holds. */
  previous: string;
  current: string;
  /** Side-by-side rows pre-computed from `previous`/`current` at emit time. */
  rows: SideBySideDiff[];
  language?: string;
}
