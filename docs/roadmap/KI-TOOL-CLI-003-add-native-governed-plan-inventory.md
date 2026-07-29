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

`ki repo` now resolves the reusable multi-target set from `KI-TOOL-CLI-006`, but exposes no native work-item inventory. Canonical governed work items are regular Markdown files directly below `docs/roadmap/`; the harness owns their format and lifecycle.

The inventory needs a deliberately read-only parser and result model that CLI-004 can reuse when it later selects repositories through KI-owned workspace groups.

### Inventory contract

`ki repo plan list` will consume the existing resolved target set and default to deterministic text output grouped by repository. Each item will expose its identifier, title, theme, horizon, status, dependency identifiers, and baseline reference.

`--format json` will emit the same stable fields in one object containing ordered repository results and isolated diagnostics. `--horizon <value>` and `--status <value>` will filter items before rendering; an empty successful result remains distinct from a malformed work-item diagnostic.

Malformed or unsafe work-item files fail only their repository result after target selection; other resolved repositories still report. The command never creates, repairs, transitions, accepts, prunes, or rewrites a work item.

## Steps

1. Add a contained, read-only canonical work-item reader that accepts only physical regular files directly below `docs/roadmap/`, validates required frontmatter and lifecycle values, and derives the stable inventory model without mutation.
2. Add `ki repo plan list [--format text|json] [--horizon <value>] [--status <value>]`, reusing `resolveRepositoryTargets()` and rendering ordered per-repository text results or one stable JSON document with isolated diagnostics.
3. Register the repository `plan` group in root help and generated completions, retaining the `ki-plan` skill as the sole lifecycle owner.
4. Add black-box contracts for active and retained items, deterministic ordering, text and JSON output, filters, empty inventories, malformed and unsafe files, and independent multi-target results.
5. Update `ki(1)`, README, and developer guidance with the inventory/lifecycle boundary, and prepare the non-blocking public-guidance handoff for `ki-website`.

## Files touched

- `src/commands/repo.ts`, a focused plan-inventory command module, `src/core/`, registration, and completion modules
- `src/tests/cli/` inventory fixtures and contracts
- `man/ki.1`, README, developer documentation, and a non-blocking KI Website handoff for public user guidance

## Verify

1. `bunx tsc --noEmit`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contracts prove deterministic, read-only inventory, exact text/JSON schemas, filter behaviour, containment, and isolated per-target diagnostics.

## Dependencies / blocks

This item is blocked by [KI-TOOL-CLI-006](KI-TOOL-CLI-006-add-multi-repository-invocations.md). It blocks [KI-TOOL-CLI-004](KI-TOOL-CLI-004-add-explicit-ki-workspaces.md).

## Discussion

### Authority boundary

`ki repo plan list` reads and validates canonical work items but does not create, transition, accept, prune, or otherwise own their lifecycle. Harness-owned work-item semantics remain the source of truth; malformed items must be isolated as diagnostics rather than normalised or repaired by the inventory command.

### Result contract

The contract uses text by default and JSON only through an explicit `--format json`. It must distinguish an empty inventory from a repository whose malformed item prevents one result from being read.

### Workspace reuse

CLI-003 owns no workspace selection. Its target-set input and per-repository result model are deliberately reusable so CLI-004 can add KI-owned named workspace groups without adding another inventory implementation.

### Dependency boundary

This item consumes CLI-006's target-set resolver and per-target reporting model. It must not add its own multi-repository selection or failure-isolation path.
