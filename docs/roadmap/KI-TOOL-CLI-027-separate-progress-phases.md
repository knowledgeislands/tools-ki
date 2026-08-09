---
id: KI-TOOL-CLI-027
title: Separate progress phases
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked-by: []
baseline-ref: df245e90305b3e1dcd84207adb31de9ea867a130
---

## Goal

Make repository-operation progress clear by showing completed loading, execution, and verification phases separately, rather than making one progress bar appear to restart.

## Context

`ki repo audit` first loads rubric definitions, then runs the known audit items. It currently uses one live line for both phases, preserving a useful continuous elapsed clock but making the indeterminate loading sweep look like a second audit run. `ki repo conform` has the same loading phase and then genuinely runs conform and verification passes.

The agreed presentation retains each completed phase as a named fixed row and refreshes only the current phase. A reader can therefore see what has completed, which phase is active, and its own elapsed time.

## Boundary

This item changes only progress-phase presentation for repository operations. It does not alter which skills run, their ordering, progress-event semantics, terminal rendering, or CLI exit behaviour.

## Current state

The progress tracker preserves one clock across definition loading and execution, but it replaces its single rendered row when the phase changes. The tree renderer is complete and remains responsible only for report layout, not live progress lifecycle management.

## Steps

- [x] Replace the single persistent progress row with named phases that retain their individual completed state.
- [x] Complete `loading definitions` before opening the active audit phase, preserving the operation clock and leaving no stale terminal row.
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

## Review

- Delivered: `loading definitions` now reports a counted progress phase and is retained as a completed row before audit or conform begins; verification remains separately labelled.
- Excluded: progress-event semantics, terminal report layout, operation ordering, and exit behaviour remain unchanged.
- Evidence: baseline `df245e90305b3e1dcd84207adb31de9ea867a130`; implementation `2d2717713ad36652d81f01f69d91263ecbfed3a3`; focused repository-progress contracts, `bunx biome check`, `bunx tsc --noEmit`, `bun run test:coverage -- --coverage.reportsDirectory=/private/tmp/ki-cli027-coverage-677039d` (560 contracts; 100% coverage), and `ki repo audit --repo .` passed.
- Decision: loading has a known definition count, so its bar is determinate rather than an indeterminate sweep; its terminal row makes the transition to audit or conform explicit.
- Concerns: none. The default coverage report directory was concurrently removed by another Vitest process, so final verification isolated only the generated report directory under `/private/tmp`.
- Learning route: consider making coverage report locations invocation-scoped if concurrent full-suite runs remain common.

## Dependencies / blocks

No implementation dependency. This is a follow-up to the reviewed tree-rendering work in `KI-TOOL-CLI-026`, not a blocker for it.

## Discussion

### Phase lifetime

The definitions phase has a known count of selected skills, while the audit-item total becomes known only after those definitions load. It should remain visible as completed instead of being recast as part of the audit bar. The progress tracker should own phase lifetime and terminal row replacement so report rendering remains a small, independent layout concern.

### Consistent operations

Audit has loading followed by audit. Conform has loading, conform, and verification; the labels make its two substantive passes intentional rather than ambiguous. The presentation must not imply that every phase has the same unit of work or a comparable completion percentage.
