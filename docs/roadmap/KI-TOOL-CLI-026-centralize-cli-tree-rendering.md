---
id: KI-TOOL-CLI-026
title: Centralize CLI rendering
theme: cli
horizon: now
status: in-progress
blocks: []
blocked-by: []
baseline-ref: a375a9f802aad45b5032ea1c03f5aadd080a1f04
---

## Goal

Give every KI command a consistent, maintainable hierarchical report so users can read the same structure across the CLI without each command reimplementing it.

## Context

User-facing commands and shared reporting code currently construct output lines themselves, embedding tree glyphs, indentation, last-item branching, and empty-state placement in many places. Examples include the `agora`, `harness`, `manage`, `repo`, and `trade` command families, plus `src/core/repository-reporting.ts`.

That repeats presentation decisions throughout the command surface and makes a structural change expensive and inconsistent. Commands should instead declare report headings, values, and child entries; one common renderer should determine the visible tree layout.

## Boundary

This item does not introduce a machine-readable output format, redesign report content, or change a command's semantic result, exit status, or stdout/stderr contract. It centralizes the existing human-readable tree presentation; any later visual redesign remains a separate decision.

## Current state

`src/core/tree-rendering.ts` now owns the tree glyphs and nesting rules. `ki manage diag` is the first consumer, while repository health exposes structured facts instead of pre-rendered lines so `diag` and `ki repo repair` can each render the information appropriate to their own command.

The remaining reports still embed tree characters in command-local arrays, interpolation expressions, or direct stdout writes. The inventory below is the migration queue; it does not establish a priority among independently safe slices.

## Steps

- [ ] Inventory every user-facing tree report and its intentional layout variants, including headings, summaries, empty states, diagnostics, continuation lines, and direct stdout writers.
- [ ] Define a small typed report-tree structure that represents labels, ordered children, and any required plain continuation text without exposing layout characters to command code.
- [ ] Implement one renderer that converts that structure to the current human-readable tree format and owns all tree glyphs, indentation, and last-child rules.
- [ ] Migrate every command and shared reporting path that emits a tree report to provide structured data to that renderer, deleting command-local branching helpers and embedded tree characters.
- [ ] Update CLI contract tests to preserve intended report content and verify representative nested, empty, diagnostic, and multi-line cases through the public `run(args, context)` seam.

## Files touched

- A new focused CLI-output rendering module under `src/core/` and its barrel export if required.
- Tree-reporting command modules under `src/commands/` and `src/core/repository-reporting.ts`.
- The affected CLI contract tests under `src/tests/cli/`.

## Candidate migrations

Already migrated:

- `ki manage diag` — `src/commands/manage/diag.ts`.

Remaining report paths:

- **Agora:** `src/commands/agora/list.ts` and `src/commands/agora/show.ts`.
- **Harness:** `src/commands/harness/index.ts`.
- **Manage:** `src/commands/manage/cleanup.ts`, `doctor.ts`, `list.ts`, `missing.ts`, `outdated.ts`, `repair.ts`, `search.ts`, and `update.ts`.
- **Repository:** `src/commands/repo/index.ts`, `repair.ts`, `roadmap.ts`, `upgrade.ts`, and the shared `src/core/repository-reporting.ts` audit and conform reports.
- **Trades:** `src/commands/trade/records.ts` and `src/commands/trade/routes.ts`.

Each migration should retain the command's own content and semantics while replacing only its layout construction. A command that needs a report structure the renderer does not yet express must stop for a separate design decision rather than growing the renderer opportunistically.

## Verify

- All user-facing tree reports render through the common typed renderer, and production command/reporting modules no longer embed tree or box-drawing characters.
- Representative CLI contract tests preserve the existing headings, nesting, summaries, empty states, diagnostics, and multi-line continuation behaviour.
- `bun run test:coverage`, `bunx tsc --noEmit`, and the repository formatting gate pass.

## Dependencies / blocks

Nothing blocks this internal refactor. It should be completed independently of output-content redesigns, because the renderer makes later presentation decisions apply consistently across every migrated report.

## Discussion

### Rendering boundary

Commands own facts and report meaning: which sections exist, their labels, order, values, diagnostics, and summary. The renderer owns presentation mechanics: prefixes, branch selection, indentation, and the final textual lines. A command must not choose `last` flags or concatenate tree markers merely to express its hierarchy.

The structure should remain deliberately small. It needs to cover the reports the CLI emits today rather than becoming a general terminal UI framework. Values that are intentionally multi-line or require continuation alignment should be represented explicitly, so their placement is also owned by the renderer rather than by a local string-prefix workaround.

### Compatibility and testing

The first migration should retain the current textual report contract unless a discrepancy is discovered and deliberately decided. Existing CLI tests are valuable output-contract evidence, but the new tests should exercise the commands through `run(args, context)` rather than testing renderer internals in isolation. A small set of representative reports must cover the rendering edge cases that every migrated command relies on.

### Completion condition

This item is complete when one searched production boundary contains the tree characters: the renderer itself. Test fixtures and assertions may retain literal expected output because they describe the public CLI contract.
