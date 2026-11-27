HANDOFF: terminal markdown renderer — remaining findings
=========================================================

Context
-------
An investigation into resize behavior, width re-calculation, and logical
inconsistencies of src/rendering/terminal-markdown-renderer/markdown-renderer.ts
produced 9 findings. The small, low-risk ones are DONE (do not redo):

  [x] 2  Width-aware tables — table() now computes colWidths from
         TerminalRenderer's width (equal distribution, min column width 3,
         ANSI-aware truncation via cli-table3). Caller-supplied
         tableOptions.colWidths is respected. Verified against
         node_modules/cli-table3 source (utils.truncateWidthWithAnsi).
  [x] 3  Dead `maxWidth: 120` removed from markdownFormattingOptions
         (TerminalRenderer never read it; types.d.ts left untouched).
  [x] 4  markdownLines() no longer strips leading indentation
         (trim -> trimEnd); whitespace-only lines still normalize to ' '.
         Verified: lint / check:types / test all green, 1 snapshot updated
         (a `space` token's leading space is now preserved — intended).

Remaining, in priority order (one file each in this directory):

  05-nested-list-rendering.txt   nested lists lose bullets/indentation
  07-code-highlight-caching.txt  code blocks re-highlight on every resize
  08-renderer-singleton-width.txt singleton setWidth is a hidden parameter
  09-resize-test-coverage.txt    the resize path has zero test coverage

Shared guardrails for all tasks
-------------------------------
- Package manager is pnpm. Sanity = `pnpm run lint`, `pnpm run check:types`,
  `pnpm run test`; all three must pass before claiming done.
- Minimal, surgical changes. No drive-by refactors or reformatting.
- The working tree contains unrelated uncommitted WIP (chat-message-content,
  scroll-list, use-pointer-focus, collapsible-diff, scroll-offset-context).
  Do not touch or revert it.
- When touching markdown-renderer.ts, preserve the blank-line convention:
  whitespace-only lines are exactly ' ', blocks are separated by ' ' rows,
  trimBlankEdges() treats only ' ' as blank.
