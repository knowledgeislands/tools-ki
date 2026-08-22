---
id: KI-TOOL-CLI-053
area: CLI
title: Aggregate roadmap inventory
theme: cli
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 8ab25fbd88ed4e9e02070bbe9d07ddc940cbe4bf
---

# KI-TOOL-CLI-053: Aggregate roadmap inventory

## Goal

Let an Agora user scan one clearly labelled, read-only inventory of selected roadmap work while retaining the existing repository-by-repository detail view.

## Context

`ki repo --agora ki-all roadmap list` resolves every selected repository but currently renders each separately. It reports a missing adapter roadmap directory as unavailable and exits non-zero, even when that repository simply contributes no roadmap. The command already filters by horizon and lifecycle status; shell completion supplies horizon values after `--horizon`, but does not yet supply status values.

## Boundary

Do not create a shared priority queue, change roadmap ownership, alter roadmap mutation commands, or downgrade malformed, unsafe, or misconfigured roadmap evidence to an empty result. Keep the existing detailed list as the default.

## Current state

The list operation reads each selected adapter directory through `readWorkItems()` and converts every failure into a per-repository diagnostic. Its presentation has only the detailed renderer. The generated completion grammar has closed values for `--horizon` but not `--status`.

## Steps

- [ ] Distinguish an absent physical adapter roadmap directory from invalid or unsafe roadmap evidence in list-only core reads.
- [ ] Add `--aggregate` to render one selected-set inventory grouped by horizon and repository while retaining repository identity, trade context, and meaningful diagnostics.
- [ ] Add lifecycle-status completion values and CLI contract coverage for aggregate output, absent roadmaps, and completion candidates.
- [ ] Update the repository-operations and shell-integration specifications and README for the changed list contract.

## Files touched

- `src/core/work/items.ts` and `src/core/work/operations.ts` — list-only absent-roadmap projection.
- `src/commands/repo/roadmap.ts` — aggregate rendering and option.
- `src/commands/manage/completion-grammar.ts` — lifecycle-status values.
- `src/tests/cli/repo/roadmap.test.ts` and `src/tests/cli/manage/completions.test.ts` — CLI contract coverage.
- `docs/specs/repository-operations.md`, `docs/specs/management.md`, and `README.md` — public behaviour and completion documentation.
- This roadmap record and issue ledger.

## Verify

1. `bunx vitest run src/tests/cli/repo/roadmap.test.ts src/tests/cli/manage/completions.test.ts` passes.
2. `bun run test:coverage` retains 100% statements, branches, functions, and lines.
3. `bunx tsc --noEmit`, `bun run build`, and `ki repo audit --repo .` pass.
4. `ki repo --agora ki-all roadmap list --aggregate` succeeds when selected repositories have no roadmap directories and labels those omissions without treating their work as a shared priority order.

## Dependencies / blocks

No local work or external coordination blocks this bounded CLI change.

## Documentation impact

### Decision Records

No decision record is needed. This preserves repository ownership and makes the existing list projection more accurate.

### Specifications

Update repository-operation requirements for absent-roadmap handling and aggregate projection, and the shell-integration requirement for lifecycle-status completion.

### Guides

No guide is needed; README command documentation is the appropriate user-facing surface.

### Roadmap

This item has no follow-on dependency. A later acceptance decision will retain or prune this record under the normal lifecycle.

## Discussion

### Aggregate meaning

`--aggregate` is a presentation switch, not a new planning authority. It groups records by their local horizons and preserves each repository label, so readers can scan one inventory without inferring estate-wide priority.

### Absence versus failure

A directory that is absent contributes no roadmap. A present directory with malformed records, a symlink, an invalid adapter declaration, or an unreadable surface remains a diagnostic and preserves the command's non-zero exit.

### Completion ergonomics

Shells should offer legal values once the user has supplied `--horizon` or `--status`; the initial option menu should remain compact and show option names and descriptions.
