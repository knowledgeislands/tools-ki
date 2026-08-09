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

The agreed presentation retains each completed phase as a named fixed row and refreshes only the current phase. A reader can therefore see what has completed, which phase is active, and its own elapsed time. Evidence details now need the same treatment: a long session must show the completed checks beneath the evidence phase instead of replacing one status in place.

## Boundary

This item changes only progress-phase presentation for repository operations. It does not alter which skills run, their ordering, progress-event semantics, or CLI exit behaviour.

## Current state

The progress tracker retains named phase rows with phase-local elapsed time and a final timing summary. Rubric-supplied evidence stages and steps now appear as nested rows while the outer evidence count stays honest.

## Steps

- [x] Replace the single persistent progress row with named phases that retain their individual completed state.
- [x] Complete `loading definitions` before opening the active audit phase, preserving the operation clock and leaving no stale terminal row.
- [x] Gather every selected audit session as a distinct counted phase before any audit item runs, preserving the canonical skill and item order.
- [x] Model conform as distinct loading, conform, and verification phases, each with its own known unit and count.
- [x] Extend interactive and plain-stream CLI contracts for phase order, elapsed time, cursor cleanup, and terminal output.
- [x] Retain completed phase rows in interactive multi-progress output, so subsequent phases do not rewind over them.
- [x] End interactive full-width progress frames with CRLF before starting a subsequent phase.
- [x] Render each rubric-supplied evidence stage or step as a retained child row with its own progress state and elapsed time.
- [x] Keep the outer evidence row as the authoritative completed-session count while nested detail rows report unmeasured or counted work.
- [x] Keep independently identified evidence rows concurrently visible without changing the sequential audit execution model.

## Files touched

- `src/core/repository-reporting.ts`, `src/core/tree-rendering.ts`, and `src/core/runtime.ts`.
- `src/commands/repo/index.ts`.
- `src/tests/cli/repo/progress-stages.test.ts`, `src/tests/cli/repo/repo.test.ts`, and `src/tests/cli/repo/conform-writes.test.ts` as required by the public contracts.

## Verify

- `ki repo audit` shows completed `loading definitions` and `gathering evidence` rows before its active audit row, with retained nested evidence checks where a rubric reports them.
- `ki repo conform` distinguishes loading, conform, and verification rows.
- Plain-stream and interactive output retain correct elapsed time, cleanup, and exit behaviour.
- Focused CLI contract tests, `bunx tsc --noEmit`, and `bun run test:coverage` pass.

## Dependencies / blocks

No implementation dependency. This is a follow-up to the reviewed tree-rendering work in `KI-TOOL-CLI-026`, not a blocker for it.

## Review

### Delivered

`ki repo audit` now retains each reported evidence check below its `evidence` phase, with completed and active child bars sharing the same visual bar column as loading, evidence, audit, and timing rows.

### Summary of changes

The shared progress reporter owns evidence-child lifetime and phase-local timing. A stage begins as a live child only until it reports a concrete step; that first step replaces the provisional wrapper, avoiding a zero-duration row. Later named steps complete the preceding child. The selected skill names determine one per-run label width, and root labels reserve the extra tree indentation so every bar starts in one column.

### Verification

Baseline: `c94714eab9c153d5845c9ad8d4ca674b64cb7d2c`. Delivered source commit: `9bbd07c4d9629490cd9da28087cfd0d43ec7c3fe`.

`bunx biome check` on the affected sources and contracts, `bunx tsc --noEmit`, focused repository CLI contracts (75 tests), `bun run test:coverage` (562 tests; 100% statements, branches, functions, and lines), and `ki repo audit --progress never` pass.

### Outstanding concerns

None. Evidence gathering remains sequential today. The renderer can retain independent rows by skill identity, but a future operation that needs concurrent rows within one skill requires an explicit event identity rather than an inferred display rule.

### Post-change review

No audit or conform logic reads rendered output. The change is confined to shared report presentation, its tree-prefix helper, and CLI contracts. Narrow output still degrades to safe truncated text when a bar does not fit.

### Mini recap

The progress display now explains long evidence gathering as real, completed work rather than one repeatedly replaced middle bar. CLI-027 awaits explicit review and acceptance.

## Discussion

### Phase lifetime

The definitions phase has a known count of selected skills, while the audit-item total becomes known only after those definitions load. It should remain visible as completed instead of being recast as part of the audit bar. The progress tracker should own phase lifetime and terminal row replacement so report rendering remains a small, independent layout concern.

### Consistent operations

Audit has loading, evidence gathering, and item audit. Conform has loading, conform, and verification; the labels make its two substantive passes intentional rather than ambiguous. The presentation must not imply that every phase has the same unit of work or a comparable completion percentage.

### Evidence detail lifetime

The evidence phase owns its session count. A rubric-supplied stage or step appears as a child row and completes when the next detail begins or its enclosing stage ends. This makes sequential checks legible without recasting the evidence count as a mechanical-item count.

Rows are keyed by their reporting skill, so independently reporting sessions can remain visible together if an operation later runs them concurrently. Existing stage events describe nesting, not concurrent identity within one skill; adding that capability would require an explicit progress-event extension rather than an inference from display text.
