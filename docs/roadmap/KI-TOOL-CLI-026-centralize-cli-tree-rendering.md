---
id: KI-TOOL-CLI-026
title: Centralize CLI rendering
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked-by: []
baseline-ref: a375a9f802aad45b5032ea1c03f5aadd080a1f04
---

## Goal

Give every KI command a consistent, maintainable hierarchical report so users can read the same structure across the CLI without each command reimplementing it.

## Context

User-facing commands and shared reporting code previously constructed output lines themselves, embedding tree glyphs, indentation, last-item branching, and empty-state placement in many places. Examples included the `agora`, `harness`, `manage`, `repo`, and `trade` command families, plus `src/core/repository-reporting.ts`.

That repeats presentation decisions throughout the command surface and makes a structural change expensive and inconsistent. Commands should instead declare report headings, values, and child entries; one common renderer should determine the visible tree layout.

## Boundary

This item does not introduce a machine-readable output format, redesign report content, or change a command's semantic result, exit status, or stdout/stderr contract. It centralizes the existing human-readable tree presentation; any later visual redesign remains a separate decision.

## Current state

`src/core/tree-rendering.ts` owns the tree glyphs and nesting rules. It provides a batch renderer for bounded reports and a streaming reporter with declared section sizes, title context, explicit multi-line continuations, and the common progress prefix. Commands provide report facts and structure; they do not select branches, pad labels, or embed layout characters.

Every known production tree report now uses that boundary. `ki manage diag` and `ki repo repair` independently render the structured repository-health facts they need, while repository audit and conform emit their output progressively through the streaming reporter.

## Steps

- [x] Inventory every user-facing tree report and its intentional layout variants, including headings, summaries, empty states, diagnostics, continuation lines, and direct stdout writers.
- [x] Define a small typed report-tree structure that represents labels, ordered children, and any required plain continuation text without exposing layout characters to command code.
- [x] Implement one renderer that converts that structure to the current human-readable tree format and owns all tree glyphs, indentation, and last-child rules.
- [x] Migrate every command and shared reporting path that emits a tree report to provide structured data to that renderer, deleting command-local branching helpers and embedded tree characters.
- [x] Update CLI contract tests to preserve intended report content and verify representative nested, empty, diagnostic, and multi-line cases through the public `run(args, context)` seam.

## Files touched

- A new focused CLI-output rendering module under `src/core/` and its barrel export if required.
- Tree-reporting command modules under `src/commands/` and `src/core/repository-reporting.ts`.
- The affected CLI contract tests under `src/tests/cli/`.

## Candidate migrations

Completed migrations:

- **Agora:** profile lists and details.
- **Harness:** status reports.
- **Manage:** diagnostics, cleanup, doctor, inventory, missing, outdated, repair, search, and update reports.
- **Repository:** repair, upgrade, roadmap, audit, and conform reports.
- **Trades:** record lists, route lists, and route checks.

Each migration retained command content and semantics while replacing layout construction. The streaming reporter was added only after agreeing the need to render progress and final reports incrementally; its caller declares the child count of each open section so the renderer can choose branches at write time.

## Verify

- All user-facing tree reports render through the common typed renderer, and production command/reporting modules no longer embed tree or box-drawing characters.
- Representative CLI contract tests preserve the existing headings, nesting, summaries, empty states, diagnostics, and multi-line continuation behaviour.
- `bun run test:coverage`, `bunx tsc --noEmit`, and the repository formatting gate pass.

## Dependencies / blocks

Nothing blocks this internal refactor. It should be completed independently of output-content redesigns, because the renderer makes later presentation decisions apply consistently across every migrated report.

## Review

### Delivered

All current production tree reports now pass structured entries to `src/core/tree-rendering.ts`. The shared renderer owns branches, indentation, title context, continuations, normalized label whitespace, and streamed report sections.

### Summary of changes

Migrated the Agora, Harness, Manage, Repository, and Trade report paths. Repository audit and conform now start their report before live progress, then stream their final sections and terminal summary through the common reporter.

### Verification

Focused CLI contract tests, `bunx tsc --noEmit`, `bun run test:coverage`, and production-source scans for tree glyphs passed. The roadmap and authoring audits also pass.

### Outstanding concerns

None within this item’s tree-rendering scope. The user-visible distinction between loading and execution progress is tracked separately by `KI-TOOL-CLI-027`.

### Post-change review

Manual interactive review confirmed that the report formatting and continuously advancing elapsed time are clear. It also identified that loading rubric definitions and running the audit currently share one resetting progress line; the agreed follow-up is to retain named completed phases as separate rows.

### Mini recap

The renderer is deliberately a small report-layout boundary rather than a terminal UI framework. Progress phase presentation is intentionally outside that boundary.

## Discussion

### Rendering boundary

Commands own facts and report meaning: which sections exist, their labels, order, values, diagnostics, and summary. The renderer owns presentation mechanics: prefixes, branch selection, indentation, and the final textual lines. A command must not choose `last` flags or concatenate tree markers merely to express its hierarchy.

The structure should remain deliberately small. It needs to cover the reports the CLI emits today rather than becoming a general terminal UI framework. Values that are intentionally multi-line or require continuation alignment should be represented explicitly, so their placement is also owned by the renderer rather than by a local string-prefix workaround.

### Compatibility and testing

The first migration should retain the current textual report contract unless a discrepancy is discovered and deliberately decided. Existing CLI tests are valuable output-contract evidence, but the new tests should exercise the commands through `run(args, context)` rather than testing renderer internals in isolation. A small set of representative reports must cover the rendering edge cases that every migrated command relies on.

### Completion condition

This item is complete when one searched production boundary contains the tree characters: the renderer itself. Test fixtures and assertions may retain literal expected output because they describe the public CLI contract.
