---
id: KI-TOOL-CLI-027
title: Separate progress phases
theme: cli
horizon: next
status: draft
blocks: []
blocked-by: []
baseline-ref: null
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

- [ ] Model named progress phases with independently retained completion state.
- [ ] Render completed loading and active audit phases as separate rows without leaving stale terminal content.
- [ ] Apply the same model to conform and its verification pass.
- [ ] Extend CLI contract tests for interactive and plain-stream phase output.

## Files touched

- `src/core/repository-reporting.ts`.
- Repository-operation CLI contract tests under `src/tests/cli/repo/`.

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

Audit has loading followed by audit. Conform has loading, conform, and verification; the labels make its two substantive passes intentional rather than ambiguous. The presentation must not imply that every phase has the same unit of work or a comparable completion percentage.
