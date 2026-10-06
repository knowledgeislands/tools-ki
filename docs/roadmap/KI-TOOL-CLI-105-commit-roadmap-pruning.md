---
id: KI-TOOL-CLI-105
area: CLI
title: Commit roadmap pruning
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: 3f96f18680c8792a837ecba1931e03ab59112741
created_at: 2026-10-06T10:20:00Z
updated_at: 2026-10-06T11:40:00Z
---

# Commit roadmap pruning

## Goal

`ki repo roadmap prune` leaves each repository with one recognisable commit that removes exactly the pruned `done` records, so Git history is the archive and nobody hand-writes the cleanup commit. A caller who wants to commit the deletions themselves can opt out.

## Context

The owner decided on 2026-10-06, in [KI-HARNESS-GOV-142](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-142-commit-roadmap-pruning.md), that pruning `done` and terminal-disposition records stays allowed, that already-pruned records are not restored, and that the command "commit the files deleted in a single standardised message, with an optional `--no-commit`".

Today `pruneRoadmap` in `src/core/work/operations.ts` resolves the selected repositories and `pruneDoneWorkItems` in `src/core/work/items.ts` deletes the records with `rm`; nothing is staged or committed, and past prune commits carry four different hand-written messages.

## Boundary

- One commit per selected repository containing exactly the deleted record paths, with the message `chore(roadmap): prune <N> done work record(s)` and one `- <ID>` body line per record in identifier order.
- `--no-commit` keeps today's delete-only behaviour, and `--dry-run` makes the same selection and checks and reports the records and planned commit without changing anything.
- The commit runs the repository's hooks; `--no-verify` is never used.
- The command refuses, before deleting anything in any selected repository, when a repository is not a Git work tree, already has staged changes, or holds a selected record that is untracked or differs from the index. Staged changes are never swept into the prune commit.
- No release is cut or published; the owner triggers the release.

## Current state

`ki repo roadmap prune [id]` deletes every canonical `done` record (or the one named record) in the selected repositories and prints the removals. There is no Git interaction and no dry-run or check mode.

## Steps

- [x] `src/core/work/items.ts`: split record selection from deletion so the operation can validate every repository before any deletion.
- [x] `src/core/work/prune-commit.ts` (new): the standardised message, the Git preflight (work tree, clean index, tracked and unmodified records) and the commit (`git rm` of exactly the records, `git commit` with hooks), restoring the records from `HEAD` if the commit fails.
- [x] `src/core/work/operations.ts`: `pruneRoadmap` takes a commit option, preflights every repository with records to remove before deleting anything, and reports each commit.
- [x] `src/commands/repo/roadmap.ts`: `--no-commit`, help text and output naming each commit.
- [x] Tests in `src/tests/cli/repo/roadmap.test.ts` against real Git repositories: default commit with exact paths and message, hooks run, multi-repository commits, `--no-commit`, refusal outside Git, refusal with staged changes, refusal for an uncommitted record, and hook failure restoring the records. Existing delete-only tests use `--no-commit`.
- [x] Documentation: `README.md`, `man/ki.1`, regenerated `man/ki.commands.json`, and `docs/specs/repository-operations.md`.

## Files touched

- `src/core/work/items.ts`, `src/core/work/operations.ts`, `src/core/work/prune-commit.ts` (new)
- `src/commands/repo/roadmap.ts`
- `src/tests/cli/repo/roadmap.test.ts`, `src/tests/cli/_cli_helper.ts`
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

## Review

### Delivered

From baseline `3f96f18680c8792a837ecba1931e03ab59112741`, `ki repo roadmap prune` commits each selected repository's pruned records as one commit containing only those deletions, with the subject `chore(roadmap): prune <N> done work record(s)` (singular for one) and one `- <ID>` body line per record in identifier order. Hooks run. Before deleting anything in any selected repository it refuses a repository that is not a Git work tree, has staged changes, or holds an untracked or modified selected record, a commit that fails or throws restores that repository's records, the index is re-checked immediately before each repository's deletion, and a commit that a hook widened with other paths is reported as an error naming them. `--no-commit` keeps delete-only behaviour without the Git checks; `--dry-run` reports the records and planned commit messages without changing anything. No release was cut.

### Change Summary

- `src/core/work/prune-commit.ts` (new): the message builder, the read-only preflight (naming staged paths), and the commit step: re-check the index, `git rm`, `git commit` with restore on any failure, and a `diff-tree` check that the commit holds only the record deletions.
- `src/core/work/items.ts`: `selectDoneWorkItems` returns repository-relative record paths without deleting; `removeWorkItemRecords` performs the delete-only path.
- `src/core/work/operations.ts`: `pruneRoadmap` takes `{ commit, dryRun }`, preflights every repository before any deletion, and names earlier commits when a later repository fails, including on an unexpected runner error.
- `src/commands/repo/roadmap.ts`: `--no-commit`, `--dry-run`, help text and output naming each commit.
- Tests, `README.md`, `man/ki.1`, `man/ki.commands.json` and the new `REPO-OPS-027` in `docs/specs/repository-operations.md`.
- Deviation: `--dry-run` was added beyond the original Steps at the coordinator's request; `src/core/work/index.ts` needed no change.

### Verification

- `bun run test:coverage`: 1051 tests pass, 100% statements, branches, functions and lines.
- `bunx tsc --noEmit`, `bunx biome check .` and `bun run ki:tools:lint-man` pass; `bun scripts/generate-command-inventory.ts` reports the inventory current.
- `printf 'chore(roadmap): prune 2 done work records\n\n- KI-TOOL-CLI-003\n- KI-TOOL-CLI-005\n' | bunx commitlint` passes, as does the singular form.
- `ki repo audit --repo . --progress never --concise` reports one failure, `DEPS-1` (Bun 1.4.1 to 1.4.2), raised by an unreleased `ki-engineering` rubric change in the dev-linked harness checkout against the unchanged `packageManager` pin; it is outside this item.

### Outstanding concerns

None in scope. The `DEPS-1` audit finding belongs to the harness `DEPS-1` work and the Bun pin, not to this change.

### Post-change review

The goal holds: a prune leaves one recognisable commit and never sweeps in staged work, because the preflight refuses a non-empty index and the commit contains only the `git rm` paths. Regression risk is limited to callers that relied on delete-only behaviour, who now pass `--no-commit`. Ready for acceptance.

### Mini recap

Delivered the commit-by-default prune with `--no-commit` and `--dry-run`, verified by the full coverage suite and commitlint. Learning route: the harness skill text describing this contract is `KI-HARNESS-GOV-142`.

## Done

Accepted 2026-10-06 on the review packet above, with Kris Brown's approval relayed by the coordinating session, after the Fable review findings were addressed.

A Fable review found nothing blocking. Its should-fix findings were applied: the index is re-checked before each repository's `git rm` and the commit is compared with `diff-tree` so a hook-widened commit is reported; the staged-changes refusal names the paths; a thrown runner failure now restores the records and keeps the earlier-commit context. Nits applied: quoted restore hint, committed-mode tests for a `kb-streams` record with a spaced name and for a repository nested in a larger work tree, and the record tidy. Declined as optional: a `rev-parse --verify HEAD` preflight (a failed commit already restores) and per-repository output grouping.

## Discussion

### Cross-repository relationship

This item originates from `knowledgeislands/ki-agentic-harness` `KI-HARNESS-GOV-142`, which rewrites the skill text to describe this behaviour. It is a non-blocking handoff: this item does not block GOV-142 and is not blocked by it, so neither record lists the other in `blocks` or `blocked_by`.

### Refuse rather than fall back

Staged changes, a non-Git directory and an uncommitted record all stop the command before any deletion instead of silently deleting without a commit. A fallback would leave the caller with an uncommitted deletion they did not ask for; `--no-commit` is the explicit way to get that.
