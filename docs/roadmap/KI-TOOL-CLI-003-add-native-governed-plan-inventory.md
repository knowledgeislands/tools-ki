---
id: KI-TOOL-CLI-003
title: Add native governed-plan inventory
theme: cli
horizon: next
status: open
blocks: [KI-TOOL-CLI-004]
blocked-by: [KI-TOOL-CLI-006]
baseline-ref: null
---

## Context

Expose governed work items in one resolved repository through a read-only `ki repo plan list` command, without making `ki` the owner of lifecycle transitions.

## Boundary

This item does not implement lifecycle transitions or aggregate multiple repositories; the workspace item owns aggregation.

## Current state

`ki repo` resolves one repository today and exposes no native work-item inventory. The harness owns work-item format and lifecycle. `KI-TOOL-CLI-006` first settles the repeatable multi-target behaviour this command must use.

## Steps

1. Define the `ki repo plan list` contract for one or more resolved repositories, including text and machine-readable output, filters, ordering, empty states, and malformed-item diagnostics.
2. Implement a read-only work-item reader that validates containment and derives inventory fields without lifecycle mutation.
3. Add the repository `plan` command group and register it in help and completions while retaining `ki-plan` ownership of lifecycle transitions.
4. Add black-box contracts for active, retained, malformed, filtered, empty, and multi-target item sets.
5. Update the manual and user documentation with the inventory/lifecycle boundary.

## Files touched

- `src/commands/`, `src/core/`, registration, and completion modules
- `src/tests/cli/` inventory fixtures and contracts
- `man/ki.1`, README, developer documentation, and a non-blocking KI Website handoff for public user guidance

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contracts prove deterministic, read-only inventory and isolated per-target diagnostics.

## Dependencies / blocks

This item is blocked by [KI-TOOL-CLI-006](KI-TOOL-CLI-006-add-multi-repository-invocations.md). It blocks [KI-TOOL-CLI-004](KI-TOOL-CLI-004-add-explicit-ki-workspaces.md).

## Discussion

### Authority boundary

`ki repo plan list` reads and validates canonical work items but does not create, transition, accept, prune, or otherwise own their lifecycle. Harness-owned work-item semantics remain the source of truth; malformed items must be isolated as diagnostics rather than normalised or repaired by the inventory command.

### Result contract

The contract must name a stable human-readable layout, one machine-readable representation, the fields derived from each item, filters, ordering, and the successful empty result. It must distinguish an empty inventory from a repository whose malformed item prevents one result from being read.

### Dependency boundary

This item consumes CLI-006's target-set resolver and per-target reporting model. It must not add its own multi-repository selection or failure-isolation path.
