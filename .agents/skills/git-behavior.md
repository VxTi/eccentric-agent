---
name: git-behavior
description: >-
  Guidelines for committing changes frequently after large chunks of work.
  Use when committing, writing commit messages, or deciding when to commit.
inclusion: auto
---
# Git Behavior

Guidelines for committing changes during and after large chunks of work.

## Commit frequently

- Commit after every completed, coherent unit of work — a feature slice, a bug fix, a refactor step. Do not accumulate hours of unrelated changes into one commit.
- Never leave a large working tree uncommitted. If work is in progress, commit the completed part with a message scoped to what is actually done.
- Every commit should compile and pass tests. If it does not, finish or revert the broken piece before committing.
- Never use `--no-verify` or bypass pre-commit hooks unless the user explicitly asks.

## Commit message format

Follow the Conventional Commits specification — a widely adopted industry standard for
commit message structure. Its core contract: every commit message consists of a header
(a type, an optional scope in parentheses, and a short imperative description separated
by a colon), an optional body, and an optional footer. The header must not end with a
period and must be lowercase-friendly and self-sufficient:

```
<imperative summary>

[optional body explaining why, not what]
```

- **Summary**: imperative mood, no trailing period, max ~50 characters. Written as if completing "this commit will …".
- **Body** (optional): one or more short paragraphs explaining *why* the change was needed and any notable side effects. Separate it from the summary with a blank line.
- Breaking changes: add `!` after the type (`feat!:`) and describe the break in the body.

## Message quality

- Clear and concise: a reader should understand the change from the summary alone.
- Be specific: prefer `fix(renderer): wrap paragraphs at terminal width` over `fix stuff` or `update renderer`.
- One logical change per commit; never mix unrelated fixes in a single commit.
- Match the tone and style of the repository's existing history when in doubt (check `git log --oneline`).

## Before committing

- Run `git status` and `git diff` to confirm exactly what is being committed — never stage blind.
- Stage only files belonging to the current change (`git add <paths>`), not unrelated dirty files.
- Verify the final message with `git log --oneline -1`.
