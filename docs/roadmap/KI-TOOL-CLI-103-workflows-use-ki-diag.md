---
id: KI-TOOL-CLI-103
area: CLI
title: Workflows use ki diag
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: d7a5aa9f170efe55be387fefbc9b614a1085c51c
created_at: 2026-10-05T11:11:18Z
updated_at: 2026-10-05T11:15:00Z
---

# Workflows use ki diag

## Goal

The CI governance job and the release `verify-release-install` job assert installation facts through the current root `ki diag` command, so CI passes again and a future release can verify its clean Linux installation.

## Context

The `manage` command group was retired and `diag` became a root command, but `.github/workflows/ci.yml` (Link and verify checked-out KI) and `.github/workflows/release.yml` (`verify-release-install`) still call `ki manage diag`. Every CI run on `main` since at least 2026-10-04 fails at that step with `unknown subcommand 'manage'`, and the next release would fail its post-publish verification the same way. The handoff came from the estate coordinator on 2026-10-05, relayed from `homebrew-tap` `BREW-007`, which noted that tools-ki owns this fix.

Commit `d7a5aa9` reshaped the `ki diag` output: the concise form prints `Installation: local|release`, `Configuration: <state>` and `Registry: <state>`; `--full` adds `Executable: <path>` and the registry `Status`. The former `Status: valid` assertion checked configuration state, which concise `ki diag` now prints directly.

## Boundary

Only the `ki diag` assertions in the two workflow files. No change to the `ki diag` command, its output, the release process, or any other job. No release is cut and nothing is published.

## Current state

Delivered: both workflows call `ki diag` or `ki diag --full`, with assertions matched to the current output and checked against simulated linked and release installations.

## Steps

- [x] CI: assert `Installation: local` from `ki diag`, the checkout `Executable` from `ki diag --full`, and after bootstrap, registration and repair, both `Configuration: valid` and `Registry: valid`.
- [x] Release: assert `Installation: release` from `ki diag`, the installed `Executable` from `ki diag --full`, and `Configuration: valid` after bootstrap (no repository is registered in that job, so the registry stays `missing`).
- [x] Simulate both installations locally from a clean export of `d7a5aa9` with isolated state directories and run actionlint.

## Files touched

`.github/workflows/ci.yml`, `.github/workflows/release.yml`, `docs/roadmap/_ISSUES.md` and this record.

## Verify

Simulated linked install (`install.sh --link`) and compiled release binary pass the new assertions; actionlint is clean; `ki repo audit` passes for this change. CI on the pushed commit gets past the verify step.

## Dependencies / blocks

None. `homebrew-tap` `BREW-007` notes that tools-ki owns this fix; it does not block that record.

## Documentation impact

### Decision Records

None.

### Specifications

None; `docs/specs/management.md` already describes root `ki diag`.

### Guides

None.

### Roadmap

`docs/roadmap/_ISSUES.md` advances `CLI` to `103`.

## Review

### Delivered

CI and release workflows no longer call the retired `ki manage diag`; each asserts installation provenance, executable path and post-bootstrap configuration state through `ki diag`, with CI also asserting the registry it populates.

### Change Summary

- `ci.yml`: `ki diag` for `Installation: local`; `ki diag --full` for `Executable: $GITHUB_WORKSPACE/src/main.ts`; one captured `ki diag` after bootstrap asserting `Configuration: valid` and `Registry: valid`.
- `release.yml`: new `Installation: release` assertion; `ki diag --full` for `Executable: $KI_CLI_INSTALL_DIR/ki`; `Configuration: valid` after bootstrap replaces the ambiguous `Status: valid`.

### Verification

- Clean export of `d7a5aa9` with isolated `HOME`, `KI_*` and `XDG_STATE_HOME`: compiled `dist/ki` reports `Installation: release`, its `Executable`, `Configuration: missing` then `valid` after `ki bootstrap`, `Registry: missing` throughout. The linked install reports `Installation: local`, the checkout `src/main.ts`, and after bootstrap, `registry add` and `repo repair`, `Configuration: valid` and `Registry: valid`.
- `actionlint` 1.7.12 on both workflows: clean.
- `bun run test:coverage` on a clean export of `d7a5aa9`: 100% on all four measures. `ki repo audit --progress never` in a detached worktree holding only this change: `ki-engineering`, `ki-specs`, `ki-work` and `ki-work-roadmap` pass; its `ki-repo` and `ki-trades` failures are worktree artefacts (untracked skill activations, unregistered path) that pass in the primary checkout. The primary checkout's own audit fails only on another session's uncommitted `docs/specs/kb-search.md` and in-progress provenance source, neither part of this change.

### Outstanding concerns

The release assertions can only run for real on the next release, which this record does not cut. On macOS the simulated `Executable` path resolves `/var` to `/private/var`; Linux runners have no such symlink, matching the assertion's previous behaviour.

### Post-change review

The assertions keep their original intent (provenance, executable identity, configured after bootstrap) and add explicit provenance and registry checks rather than loosening them. Risk is limited to the two verification steps.

### Mini recap

Workflow-only fix replacing the retired `ki manage diag` with `ki diag` and `ki diag --full`; CI is unblocked and release verification is ready for the next release.

## Discussion

### Origin

Captured, adopted, planned and delivered on 2026-10-05 under the owner's delegated estate-push authority, from the coordinator's relay of the `homebrew-tap` `BREW-007` note that tools-ki owns the `ki manage diag` fix. Small and clear, so shaped and implemented in one session; independent Fable review precedes closure.
