---
id: KI-TOOL-CLI-027
title: Separate progress phases
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked-by: []
baseline-ref: 18ca452e9d06e0f7691d78026379486bfe2d7178
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
- [x] Gather every selected audit session as a distinct counted phase before any audit item runs, preserving the canonical skill and item order.
- [x] Model conform as distinct loading, conform, and verification phases, each with its own known unit and count.
- [x] Extend interactive and plain-stream CLI contracts for phase order, elapsed time, cursor cleanup, and terminal output.
- [x] Retain completed phase rows in interactive multi-progress output, so subsequent phases do not rewind over them.

## Files touched

- `src/core/repository-reporting.ts` and `src/core/runtime.ts`.
- `src/commands/repo/index.ts`.
- `src/tests/cli/repo/progress-stages.test.ts`, `src/tests/cli/repo/repo.test.ts`, and `src/tests/cli/repo/conform-writes.test.ts` as required by the public contracts.

## Verify

- `ki repo audit` shows completed `loading definitions` and `gathering evidence` rows before its active audit row.
- `ki repo conform` distinguishes loading, conform, and verification rows.
- Plain-stream and interactive output retain correct elapsed time, cleanup, and exit behaviour.
- Focused CLI contract tests, `bunx tsc --noEmit`, and `bun run test:coverage` pass.

## Dependencies / blocks

No implementation dependency. This is a follow-up to the reviewed tree-rendering work in `KI-TOOL-CLI-026`, not a blocker for it.

## Review

### Delivered

Interactive multi-progress output now keeps each completed phase as a summary row, then draws the next active phase beneath it. This applies to both `ki repo audit` and `ki repo conform` through their shared reporter.

### Summary of changes

The reporter collapses a completed multi-progress panel to its summary and clears only the panel's former skill rows before the next phase begins. Its cursor safety limit remains in place for output taller than the terminal. The interactive audit contract now asserts that a later phase rewinds only within its own live panel.

### Verification

`bunx biome check src/core/repository-reporting.ts src/tests/cli/repo/progress-stages.test.ts`, focused audit and conform CLI contracts, `bun run test:coverage` (561 tests; 100% statements, branches, functions, and lines), and `ki repo audit --progress never` all pass.

### Outstanding concerns

None. Narrow terminals retain panels sequentially rather than attempting an unsafe cursor rewind.

### Post-change review

The renderer remains the single implementation point for audit and conform. No operation derives state from rendered output; phase state remains in the progress tracker.

### Mini recap

The visual overwrite reported for the second and third progress phases is resolved. This item awaits explicit review and acceptance.

## Discussion

### Phase lifetime

The definitions phase has a known count of selected skills, while the audit-item total becomes known only after those definitions load. It should remain visible as completed instead of being recast as part of the audit bar. The progress tracker should own phase lifetime and terminal row replacement so report rendering remains a small, independent layout concern.

### Consistent operations

Audit has loading, evidence gathering, and item audit. Conform has loading, conform, and verification; the labels make its two substantive passes intentional rather than ambiguous. The presentation must not imply that every phase has the same unit of work or a comparable completion percentage.
