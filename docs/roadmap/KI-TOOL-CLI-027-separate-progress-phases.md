---
id: KI-TOOL-CLI-027
title: Separate progress phases
theme: cli
horizon: now
status: in-progress
blocks: []
blocked-by: []
baseline-ref: f6948e171f4a031a7f0eea3d62b663cd454bb777
---

## Goal

Make repository-operation progress clear by showing completed loading, execution, and verification phases separately, rather than making one progress bar appear to restart.

## Context

`ki repo audit` first loads rubric definitions, then creates each rubric session to gather its evidence, before running the known audit items. Its per-skill evidence sweep is currently embedded in the audit row, making the audit phase appear to restart. `ki repo conform` has the same loading phase and then genuinely runs conform and verification passes.

The agreed presentation retains each completed phase as a named fixed row and refreshes only the current phase. A reader can therefore see what has completed, which phase is active, and its own elapsed time.

## Boundary

This item changes only progress-phase presentation for repository operations. It does not alter which skills run, their ordering, progress-event semantics, terminal rendering, or CLI exit behaviour.

## Current state

The progress tracker preserves one clock across definition loading and execution, but it replaces its single rendered row when the phase changes. The tree renderer is complete and remains responsible only for report layout, not live progress lifecycle management.

## Steps

- [x] Replace the single persistent progress row with named phases that retain their individual completed state.
- [x] Complete `loading definitions` before opening the active audit phase, preserving the operation clock and leaving no stale terminal row.
- [ ] Gather every selected audit session as a distinct counted phase before any audit item runs, preserving the canonical skill and item order.
- [x] Model conform as distinct loading, conform, and verification phases, each with its own known unit and count.
- [x] Extend interactive and plain-stream CLI contracts for phase order, elapsed time, cursor cleanup, and terminal output.

## Files touched

- `src/core/repository-reporting.ts`.
- `src/tests/cli/repo/progress-stages.test.ts`, `src/tests/cli/repo/repo.test.ts`, and `src/tests/cli/repo/conform-writes.test.ts` as required by the public contracts.

## Verify

- `ki repo audit` shows a completed `loading definitions` row before its active audit row.
- `ki repo conform` distinguishes loading, conform, and verification rows.
- Plain-stream and interactive output retain correct elapsed time, cleanup, and exit behaviour.
- Focused CLI contract tests, `bunx tsc --noEmit`, and `bun run test:coverage` pass.

## Dependencies / blocks

No implementation dependency. This is a follow-up to the reviewed tree-rendering work in `KI-TOOL-CLI-026`, not a blocker for it.

## Discussion

### Phase lifetime

The definitions phase has a known count of selected skills, while the audit-item total becomes known only after those definitions load. It should remain visible as completed instead of being recast as part of the audit bar. The progress tracker should own phase lifetime and terminal row replacement so report rendering remains a small, independent layout concern.

### Consistent operations

Audit has loading, evidence gathering, and item audit. Conform has loading, conform, and verification; the labels make its two substantive passes intentional rather than ambiguous. The presentation must not imply that every phase has the same unit of work or a comparable completion percentage.
