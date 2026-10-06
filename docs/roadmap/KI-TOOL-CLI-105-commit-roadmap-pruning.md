---
id: KI-TOOL-CLI-105
area: CLI
title: Commit roadmap pruning
theme: cli
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-06T10:20:00Z
updated_at: 2026-10-06T10:20:00Z
---

# Commit roadmap pruning

## Goal

`ki repo roadmap prune` leaves each repository with one recognisable commit that removes exactly the pruned `done` records, so Git history is the archive and nobody hand-writes the cleanup commit. A caller who wants to commit the deletions themselves can opt out.

## Context

The owner decided on 2026-10-06, in [KI-HARNESS-GOV-142](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-142-commit-roadmap-pruning.md), that pruning `done` and terminal-disposition records stays allowed, that already-pruned records are not restored, and that the command "commit the files deleted in a single standardised message, with an optional `--no-commit`".

Today `pruneRoadmap` in `src/core/work/operations.ts` resolves the selected repositories and `pruneDoneWorkItems` in `src/core/work/items.ts` deletes the records with `rm`; nothing is staged or committed, and past prune commits carry four different hand-written messages.

## Boundary

- One commit per selected repository containing exactly the deleted record paths, with the message `chore(roadmap): prune <N> done work record(s)` and one `- <ID>` body line per record in identifier order.
- `--no-commit` keeps today's delete-only behaviour.
- The commit runs the repository's hooks; `--no-verify` is never used.
- The command refuses, before deleting anything in any selected repository, when a repository is not a Git work tree, already has staged changes, or holds a selected record that is untracked or differs from the index. Staged changes are never swept into the prune commit.
- No release is cut or published; the owner triggers the release.

## Current state

`ki repo roadmap prune [id]` deletes every canonical `done` record (or the one named record) in the selected repositories and prints the removals. There is no Git interaction and no dry-run or check mode.

## Steps

- [ ] `src/core/work/items.ts`: split record selection from deletion so the operation can validate every repository before any deletion.
- [ ] `src/core/work/prune-commit.ts` (new): the standardised message, the Git preflight (work tree, clean index, tracked and unmodified records) and the commit (`git rm` of exactly the records, `git commit` with hooks), restoring the records from `HEAD` if the commit fails.
- [ ] `src/core/work/operations.ts`: `pruneRoadmap` takes a commit option, preflights every repository with records to remove before deleting anything, and reports each commit.
- [ ] `src/commands/repo/roadmap.ts`: `--no-commit`, help text and output naming each commit.
- [ ] Tests in `src/tests/cli/repo/roadmap.test.ts` against real Git repositories: default commit with exact paths and message, hooks run, multi-repository commits, `--no-commit`, refusal outside Git, refusal with staged changes, refusal for an uncommitted record, and hook failure restoring the records. Existing delete-only tests use `--no-commit`.
- [ ] Documentation: `README.md`, `man/ki.1`, regenerated `man/ki.commands.json`, and `docs/specs/repository-operations.md`.

## Files touched

- `src/core/work/items.ts`, `src/core/work/operations.ts`, `src/core/work/prune-commit.ts` (new), `src/core/work/index.ts`
- `src/commands/repo/roadmap.ts`
- `src/tests/cli/repo/roadmap.test.ts`
- `README.md`, `man/ki.1`, `man/ki.commands.json`, `docs/specs/repository-operations.md`

## Verify

```bash
bun run test
bunx tsc --noEmit
bunx biome check .
bun run ki:tools:lint-man
ki repo audit --repo . --progress never --concise
```

The audit reports FAIL=0, and `printf 'chore(roadmap): prune 2 done work records\n\n- KI-TOOL-CLI-003\n- KI-TOOL-CLI-005\n' | bunx commitlint` passes.

## Dependencies / blocks

No local dependency. The cross-repository relationship is recorded under Discussion.

## Documentation impact

### Decision Records

None in this repository; the owner's decision is recorded in KI-HARNESS-GOV-142.

### Specifications

`docs/specs/repository-operations.md` gains the commit contract for `ki repo roadmap prune`.

### Guides

`README.md`, `man/ki.1` and command help.

### Roadmap

None beyond this record.

## Discussion

### Cross-repository relationship

This item originates from `knowledgeislands/ki-agentic-harness` `KI-HARNESS-GOV-142`, which rewrites the skill text to describe this behaviour. It is a non-blocking handoff: this item does not block GOV-142 and is not blocked by it, so neither record lists the other in `blocks` or `blocked_by`.

### Refuse rather than fall back

Staged changes, a non-Git directory and an uncommitted record all stop the command before any deletion instead of silently deleting without a commit. A fallback would leave the caller with an uncommitted deletion they did not ask for; `--no-commit` is the explicit way to get that.
