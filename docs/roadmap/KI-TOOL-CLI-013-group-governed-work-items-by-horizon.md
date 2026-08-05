---
id: KI-TOOL-CLI-013
title: Group roadmap output
theme: cli
horizon: next
status: done
blocks: []
blocked-by: []
baseline-ref: e94e78089a507f1da3ea4faf7305ad6dd6875db4
---

## Goal

Let users scan `ki repo roadmap list` text output in its planning order: the most immediate horizon first, then work at the same horizon from completed through open.

## Context

`ki repo plan list` currently renders one flat, identifier-ordered list for each selected repository. The public command should instead be `ki repo roadmap list`, which names the resource it inspects. Its text view should make the priority model already carried by each work item's `horizon` and lifecycle `status` fields visible without changing the stable JSON interface.

The human-readable output should group items by the standard horizon order: `blocking`, `next`, `soon`, `waiting-for`, `parked`, then `future`. Within each displayed horizon, items should follow lifecycle order: `done`, `acceptance`, `in-progress`, `ready`, then `open`; items with equal horizon and status remain ordered by identifier.

## Boundary

Do not change the canonical work-item schema, lifecycle semantics, filtering options, repository selection, or the JSON output contract. Do not infer a priority beyond the horizon and status already declared by the owning repository. Retire `ki repo plan list` without a compatibility path.

## Current state

`src/commands/repo/plan.ts` reads and filters canonical work items, then renders the text output in the order supplied by `readWorkItems`. The command's tests cover filtering, JSON output, empty results, and diagnostics, but not grouping the text output by planning horizon or lifecycle state. The root catalogue, help, completions, changelog, and manual still call this inspection surface `plan`.

## Steps

- [x] Replace the public `ki repo plan list` namespace with `ki repo roadmap list` and remove the former grammar from root wiring, help, completions, and catalogue inventory.
- [x] Define one deterministic text-ordering helper using the six canonical horizons and five lifecycle statuses, with identifier ordering as the final tie-breaker.
- [x] Render non-empty text inventories as ordered horizon groups within each repository while preserving repository order, diagnostics, and `Items: none` behavior.
- [x] Preserve the existing filtered and JSON behavior; a filter narrows the inventory before text grouping rather than introducing a second selection rule.
- [x] Add CLI-contract tests covering the retired `plan` grammar, all horizons, lifecycle ordering, identifier tie-breaking, filtered output, empty output, and unchanged JSON serialization.
- [x] Update public command documentation and the man page to describe the `roadmap` namespace, grouped text output, and stable JSON boundary.

## Files touched

- `src/commands/repo/plan.ts`
- `src/commands/repo/index.ts`
- `src/commands/catalogue.ts`
- `src/tests/cli/plan.test.ts`
- `src/tests/cli/inventory.test.ts`
- `src/tests/cli/completions.test.ts`
- `README.md`
- `man/ki.1`
- This roadmap item

## Verify

- `bunx vitest run src/tests/cli/plan.test.ts`
- `bun run test`
- `bunx tsc --noEmit`
- `ki repo roadmap list --repo <fixture-or-repository>` emits the six horizons in canonical order, lifecycle states from `done` through `open`, and identifier order for ties.
- `ki repo roadmap list --repo <fixture-or-repository> --format json` preserves its current document shape and item order contract.
- `ki repo plan list` is rejected as retired syntax.

## Dependencies / blocks

This is a self-contained rendering change. It does not block or depend on another current roadmap item.

## Acceptance

### Delivered

`ki repo roadmap list` replaces `ki repo plan list` without a compatibility command.

Text output now groups each repository's non-empty work inventory by canonical horizon and then lifecycle status, with the identifier as the final tie-breaker.

`--horizon` and `--status` filter before this grouping; `--format json` retains its former stable, identifier-ordered document shape.

### Evidence

The immutable baseline is `e94e78089a507f1da3ea4faf7305ad6dd6875db4`.

Delivery is committed in `9df88608a7e39ee34759f9bee46aa2b9c56bd559`.

### Verification

- Focused CLI contracts for roadmap, inventory, completions, repository targets, Agora selection, and help passed.
- `bun run test:coverage` passed with the repository's enforced 100% coverage thresholds.
- `bunx tsc --noEmit`, `bunx biome check`, Markdown lint, `mandoc -Tlint man/ki.1`, and `git diff --check` passed.
- `ki repo roadmap list --repo .` rendered the grouped local inventory; its JSON mode retained the stable document shape; `ki repo plan list` was rejected as an unknown subcommand.
- `ki repo audit --skill ki-roadmap --repo .` and `ki repo audit --skill ki-trades --repo .` passed.

### Outstanding concerns

None. This item does not introduce a lifecycle transition or schema change, and the machine-readable JSON contract remains unchanged.

## Done

On 2026-08-05, the user explicitly accepted this evidence packet and approved terminal closure as `done`.

## Discussion

### Text output is a planning view

The text mode is intended for a person selecting or reviewing work, so its order should make the planning model visible without requiring each reader to sort a flat list mentally. Grouping applies separately to each selected repository because a repository owns its own priorities; the CLI must not create a portfolio priority across repositories.

### JSON remains a stable machine interface

Changing the order or nesting of JSON would be a separate public-contract decision. Keeping JSON unchanged lets scripts retain their current behavior while the text view becomes easier to scan.

### Status order is descriptive, not a transition

Displaying `done` before `open` within a horizon presents the item's existing lifecycle state. It does not imply that done work should be selected ahead of open work, nor does it affect eligibility, dependencies, or any process transition.
