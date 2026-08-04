---
id: KI-TOOL-CLI-013
title: Group governed work-item text output by horizon
theme: cli
horizon: next
status: open
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Let users scan `ki repo plan list` text output in its planning order: the most immediate horizon first, then work at the same horizon from completed through open.

## Context

`ki repo plan list` currently renders one flat, identifier-ordered list for each selected repository. That makes the command deterministic but obscures the priority model already carried by each work item's `horizon` and lifecycle `status` fields.

The human-readable output should group items by the standard horizon order: `blocking`, `next`, `soon`, `waiting-for`, `parked`, then `future`. Within each displayed horizon, items should follow lifecycle order: `done`, `acceptance`, `in-progress`, `ready`, then `open`; items with equal horizon and status remain ordered by identifier.

## Boundary

Do not change the canonical work-item schema, lifecycle semantics, filtering options, repository selection, or the JSON output contract. Do not infer a priority beyond the horizon and status already declared by the owning repository.

## Current state

`src/commands/plan.ts` reads and filters canonical work items, then renders the text output in the order supplied by `readWorkItems`. The command's tests cover filtering, JSON output, empty results, and diagnostics, but not grouping the text output by planning horizon or lifecycle state.

## Steps

- [ ] Define one deterministic text-ordering helper using the six canonical horizons and five lifecycle statuses, with identifier ordering as the final tie-breaker.
- [ ] Render non-empty text inventories as ordered horizon groups within each repository while preserving repository order, diagnostics, and `Items: none` behavior.
- [ ] Preserve the existing filtered and JSON behavior; a filter narrows the inventory before text grouping rather than introducing a second selection rule.
- [ ] Add CLI-contract tests covering all horizons, lifecycle ordering, identifier tie-breaking, filtered output, empty output, and unchanged JSON serialization.
- [ ] Update public command documentation and the man page to describe the grouped text output and stable JSON boundary.

## Files touched

- `src/commands/plan.ts`
- `src/tests/cli/plan.test.ts`
- `README.md`
- `man/ki.1`
- This roadmap item

## Verify

- `bunx vitest run src/tests/cli/plan.test.ts`
- `bun run test`
- `bunx tsc --noEmit`
- `ki repo plan list --repo <fixture-or-repository>` emits the six horizons in canonical order, lifecycle states from `done` through `open`, and identifier order for ties.
- `ki repo plan list --repo <fixture-or-repository> --format json` preserves its current document shape and item order contract.

## Dependencies / blocks

This is a self-contained rendering change. It does not block or depend on another current roadmap item.

## Discussion

### Text output is a planning view

The text mode is intended for a person selecting or reviewing work, so its order should make the planning model visible without requiring each reader to sort a flat list mentally. Grouping applies separately to each selected repository because a repository owns its own priorities; the CLI must not create a portfolio priority across repositories.

### JSON remains a stable machine interface

Changing the order or nesting of JSON would be a separate public-contract decision. Keeping JSON unchanged lets scripts retain their current behavior while the text view becomes easier to scan.

### Status order is descriptive, not a transition

Displaying `done` before `open` within a horizon presents the item's existing lifecycle state. It does not imply that done work should be selected ahead of open work, nor does it affect eligibility, dependencies, or any process transition.
