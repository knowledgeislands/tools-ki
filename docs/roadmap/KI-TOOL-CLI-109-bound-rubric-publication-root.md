---
id: KI-TOOL-CLI-109
area: CLI
title: Bound rubric publication root
kind: deliver
purpose: corrective
initiative: platform-foundations
component: dev
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: d23398f33789f3ab97cc83dc30b54cf7a12e922a
created_at: 2026-10-06T23:03:55Z
updated_at: 2026-10-08T08:09:27Z
---

# Bound rubric publication root

## Goal

`ki dev skill rubric --write` publishes only into the caller's own Git working tree, and refuses, naming both roots, when the resolved publication root is anywhere else.

## Context

`ki dev skill rubric` resolves installed harnesses and never the current directory. With a dev-linked install, a run from a linked worktree, another repository or no repository answers about the dev-linked primary checkout, and `--write` writes generated rubric bytes there. An agent working in an isolated worktree can therefore change the primary checkout without meaning to. `main` has the publication-root concept but no check that the publication root and the current directory share a working tree.

An implementation with tests already exists on the retained Paperclip branch `paperclip/aligned-20260926/KIS-46-ki-dev-skill-rubric-resolves-the-dev-linked-primary-checkout-never-the-cwd-worktree-si`, commit `3a10a7028e1a739a99ed2acb9301ce8bfe6f0227` (`fix(cli): bound rubric publication to the caller's working tree`, 11 files, +253/-33). It:

- names the resolved publication root in every result;
- compares Git working-tree roots for equality and denies by default, so a linked worktree of the same repository, an unrelated repository, no repository and a repository enclosing the checkout all refuse with both roots named and exit 2;
- adds a shared `gitWorkingTreeRoot` primitive that clears `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR` and `GIT_CEILING_DIRECTORIES`, because an inherited `GIT_WORK_TREE` would otherwise collapse both sides of the comparison onto one value;
- compares Git's output rather than the inputs, so a symlinked prefix does not refuse a legitimate write.

On 2026-10-07 the branch was 181 commits behind `main` and still merged cleanly. The branch is kept until this record is delivered. Origin: the 2026-10-07 leftover-state review tracked in the `ki-arcadia-principal` checkpoint `+/_CHECKPOINTS/state-of-play.md`.

## Boundary

In scope: the `--write` safety interlock on which working tree receives the bytes, and reporting the resolved publication root.

Out of scope: treating the interlock as an isolation boundary. A caller able to export environment variables can equally write a `.git` file into a directory it controls; sandboxing is a runtime concern.

## Current state

Planned on 2026-10-07 against `main`. The retained commit `3a10a70` applies to current `main` without conflict. `main` still resolves installed Harnesses for `ki dev skill rubric` with no check that the publication root and the caller share a working tree, and `SKILL-005` is unallocated in `docs/specs/skills.md`.

## Steps

- [x] Reapply commit `3a10a70` onto current `main` (route chosen: reapply as a fresh change rather than rebase the 181-commit-old branch), and review it as a new change: the publication-root comparison in `src/core/harness/development/rubric.ts`, the shared `gitWorkingTreeRoot` primitive in `src/core/runtime/git.ts`, the port and renderer changes, the sandbox `git` fixture helper and the rubric tests.
- [x] Regenerate `man/ki.commands.json` from `man/ki.1` and confirm the manual lints.
- [x] Keep `SKILL-005` in `docs/specs/skills.md` as the accepted behaviour.

## Files touched

- `src/core/runtime/git.ts` (new), `src/core/harness/development/rubric.ts`, `src/core/harness/development/types.ts`, `src/commands/dev/ports.ts`, `src/commands/dev/skill/index.ts`
- `src/tests/cli/_cli_helper.ts`, `src/tests/cli/skill/rubric.test.ts`, `src/tests/cli/skill/rubric-publication.test.ts`
- `docs/specs/skills.md`, `man/ki.1`, `man/ki.commands.json`
- this record

## Verify

- `bun run test:coverage` passes with 100% coverage, including the new rubric publication-tree tests.
- `bunx tsc --noEmit`, Biome, `mandoc -T lint man/ki.1` and the command-inventory check are clean.
- `~/.local/bin/ki repo audit --repo .` passes apart from worktree-local findings.

## Dependencies / blocks

None.

## Documentation impact

### Decision Records

None: the change applies existing publication-root behaviour and changes no decision.

### Specifications

New `SKILL-005` (Attributable publication tree) in `docs/specs/skills.md`.

### Guides

None; the manual entry for `ki dev skill rubric` describes the refusal.

### Roadmap

None.

## Review

### Delivered

`ki dev skill rubric` now names the resolved publication root in every result, and `--write` publishes only when that root and the current directory belong to the same Git working tree; any other tree, including another worktree of the same repository, an enclosing repository or no repository, is refused with exit `2` and both roots named. Out of scope as planned: treating the interlock as an isolation boundary. Baseline `d23398f33789f3ab97cc83dc30b54cf7a12e922a`.

### Change Summary

- `src/core/runtime/git.ts` (new): `gitWorkingTreeRoot` returns the physical working-tree root for a directory, clearing `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR` and `GIT_CEILING_DIRECTORIES` so an inherited value cannot make both sides of the comparison agree vacuously.
- `src/core/harness/development/rubric.ts`, `types.ts`, `src/commands/dev/ports.ts`, `src/commands/dev/skill/index.ts`: the port gains `repositoryRoot`, `--write` compares the caller's and the publication root's working trees, and every event carries the publication root.
- `src/tests/cli/_cli_helper.ts`: sandbox areas gain a deterministic `git` fixture helper; `rubric.test.ts` and `rubric-publication.test.ts` cover the permitted and refused trees, including an exported `GIT_WORK_TREE`.
- `docs/specs/skills.md`: new `SKILL-005` (Attributable publication tree); `man/ki.1` and `man/ki.commands.json` describe the refusal.

The retained Paperclip commit `3a10a70` was reapplied to current `main` as a fresh change and reviewed; it needed no adjustment.

### Verification

- `bun run test:coverage`: 1093 tests pass with 100% statement, branch, function and line coverage.
- `bunx tsc --noEmit` clean; Biome reports no errors in the touched files; `mandoc -T lint man/ki.1` clean.
- `ki repo audit` in the delivery worktree: only `REPO-REG-1` (the temporary worktree is unregistered) and `RUNTIMES-2` (its ignored runtime skill activations are absent); both are worktree-local and the change touches neither.

### Outstanding concerns

None for this record. The interlock is a safety check on which tree receives bytes, not a sandbox, as the Boundary states.

### Post-change review

The goal is met at the single command boundary, and read-only results now say which tree they answer about. Regression risk is limited to `--write` callers outside the publication tree, which is the intended refusal. Ready for acceptance.

### Mini recap

Rubric publication bounded to the caller's working tree and specified as `SKILL-005`; no learning route beyond the specification and manual.

## Discussion

### Delivery route

Shaping should decide whether to rebase the branch commit onto current `main` or reapply it, then re-run `bun run test` and `bunx tsc --noEmit` and review the result as a fresh change. The commit was produced in a Paperclip run and has not been reviewed.

### Open questions

- Should read-only `ki dev skill rubric` also warn when the publication root differs from the current working tree? Not taken in this delivery: every read-only result now names the resolved publication root, which makes the difference visible without a new warning. Recapture if a caller is misled in practice.

### Adoption and readiness

Adopted from Triage into Now, shaped and marked Ready on 2026-10-07 under Kris's standing continuous-delivery decision (state-of-play Decisions 12, 17 and 19).
