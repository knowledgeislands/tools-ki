---
id: KI-TOOL-CLI-109
area: CLI
title: Bound rubric publication root
kind: deliver
purpose: corrective
initiative: platform-foundations
component: dev
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-06T23:03:55Z
updated_at: 2026-10-07T21:09:53Z
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

- [ ] Reapply commit `3a10a70` onto current `main` (route chosen: reapply as a fresh change rather than rebase the 181-commit-old branch), and review it as a new change: the publication-root comparison in `src/core/harness/development/rubric.ts`, the shared `gitWorkingTreeRoot` primitive in `src/core/runtime/git.ts`, the port and renderer changes, the sandbox `git` fixture helper and the rubric tests.
- [ ] Regenerate `man/ki.commands.json` from `man/ki.1` and confirm the manual lints.
- [ ] Keep `SKILL-005` in `docs/specs/skills.md` as the accepted behaviour.

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

## Discussion

### Delivery route

Shaping should decide whether to rebase the branch commit onto current `main` or reapply it, then re-run `bun run test` and `bunx tsc --noEmit` and review the result as a fresh change. The commit was produced in a Paperclip run and has not been reviewed.

### Open questions

- Should read-only `ki dev skill rubric` also warn when the publication root differs from the current working tree? Not taken in this delivery: every read-only result now names the resolved publication root, which makes the difference visible without a new warning. Recapture if a caller is misled in practice.

### Adoption and readiness

Adopted from Triage into Now, shaped and marked Ready on 2026-10-07 under Kris's standing continuous-delivery decision (state-of-play Decisions 12, 17 and 19).
