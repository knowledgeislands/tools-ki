---
id: KI-TOOL-CLI-003
title: Add native governed-work inspection commands
theme: cli
horizon: next
status: open
blocks: []
blocked-by: [KI-TOOL-CLI-006]
baseline-ref: null
---

## Context

Expose governed work items through a read-only native `ki repo plan` command group, beginning with `list`, without making `ki` the owner of lifecycle transitions.

## Boundary

This item does not implement lifecycle transitions, confirmation prompts, creation, transition, acceptance, pruning, or repair. It does not add a second target-selection path: CLI-006 and CLI-004 own repository selection.

## Current state

`ki repo` now resolves the reusable multi-target set from `KI-TOOL-CLI-006`, but exposes no native work-item inventory. Canonical governed work items are regular Markdown files directly below `docs/roadmap/`; the harness owns their format and lifecycle.

The inventory needs a deliberately read-only parser and result model that can consume any repository target set, including KI-owned workspace groups once CLI-004 supplies them.

### Inventory contract

`ki repo plan list` will consume the existing resolved target set and default to deterministic text output grouped by repository. Each item will expose its identifier, title, theme, horizon, status, dependency identifiers, and baseline reference. `list` is the complete initial native inspection surface; any later command must earn a separate authority and confirmation design.

`--format json` will emit the same stable fields in one object containing ordered repository results and isolated diagnostics. `--horizon <value>` and `--status <value>` will filter items before rendering; an empty successful result remains distinct from a malformed work-item diagnostic.

Malformed or unsafe work-item files fail only their repository result after target selection; other resolved repositories still report. The command never creates, repairs, transitions, accepts, prunes, or rewrites a work item.

## Steps

1. Add a contained, read-only canonical work-item reader that accepts only physical regular files directly below `docs/roadmap/`, validates required frontmatter and lifecycle values, and derives the stable inventory model without mutation.
2. Add `ki repo plan list [--format text|json] [--horizon <value>] [--status <value>]`, reusing `resolveRepositoryTargets()` and rendering ordered per-repository text results or one stable JSON document with isolated diagnostics.
3. Register the repository `plan` group and its initial `list` subcommand in root help and generated completions, retaining the `ki-plan` skill as the sole lifecycle owner.
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

This item is blocked by [KI-TOOL-CLI-006](KI-TOOL-CLI-006-add-multi-repository-invocations.md). It does not block CLI-004: workspace selection is independently delivered and CLI-003 consumes it only when available.

## Discussion

### Authority boundary

`ki repo plan list` reads and validates canonical work items but does not create, transition, accept, prune, or otherwise own their lifecycle. Harness-owned work-item semantics remain the source of truth; malformed items must be isolated as diagnostics rather than normalised or repaired by the inventory command.

### Result contract

The contract uses text by default and JSON only through an explicit `--format json`. It must distinguish an empty inventory from a repository whose malformed item prevents one result from being read.

### Workspace reuse

CLI-003 owns no workspace selection. Its target-set input and per-repository result model deliberately accept the selector that CLI-004 supplies, without making either item a prerequisite for the other.

### Consolidated CLI-007 scope

CLI-007's concrete inspection intent is consolidated here: `ki repo plan` is the native inspection supercommand and `list` is its initial operation. CLI-007's undefined future mutation or orchestration idea is not carried forward because it lacks a demonstrated need, a lifecycle authority, and a confirmation model.

### Dependency boundary

This item consumes CLI-006's target-set resolver and per-target reporting model. It must not add its own multi-repository selection or failure-isolation path.
