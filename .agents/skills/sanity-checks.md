---
name: sanity-checks
description: >-
  Commands to verify the project compiles, passes lint, and passes tests.
  Use before committing, after code changes, or when asked to check the
  project's health.
inclusion: always
---

# Sanity Checks

Run these from the repository root. All use npm scripts defined in `package.json`.
The package manager is `pnpm`.

## Commands

| Purpose    | Command               | Notes                                          |
| ---------- | --------------------- | ---------------------------------------------- |
| Lint       | `pnpm run lint`        | ESLint over `src/**/*.{ts,tsx}`, auto-fixes.   |
| Lint (CI)  | `pnpm run lint:ci`     | Same as lint, but fails on any warning.        |
| Types      | `pnpm run check:types` | `tsc --noEmit`; no output means success.       |
| Tests      | `pnpm run test`        | Vitest, single run; `-u` rewrites snapshots.   |
| Build      | `pnpm run build`       | esbuild bundle to `dist/index.js` (ESM, Node). |
| App        | `pnpm run start`       | Runs `src/main.tsx` via vite-node.             |

## When to run what

1. After editing source: `pnpm run lint` then `pnpm run check:types`.
2. Before committing: `pnpm run test` as well; treat snapshot changes in the
   diff as intentional only if you reviewed them.
3. Claiming a task done: all three of lint, types, and tests must pass.

## Rules

- Never report a pass you did not observe. Quote the actual command output on
  failure, shortest decisive lines only.
- `pnpm run lint` auto-fixes; re-read files it touched before continuing.
- `pnpm run test` may rewrite snapshots (`-u`): if snapshots changed without an
  intentional behavioral change, investigate before committing.
