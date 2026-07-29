---
id: KI-TOOL-CLI-004
title: Add explicit KI workspaces
theme: cli
horizon: next
status: open
blocks: []
blocked-by: [KI-TOOL-CLI-003]
baseline-ref: null
---

## Context

Let a user define named, explicit sets of KI repository roots and query their governed-work inventory through `ki workspace`.

## Boundary

This item does not recursively scan ambient folders, replace Git, or introduce mutation fan-out.

## Current state

The CLI has no persisted workspace definition or aggregate work-item view. `KI-TOOL-CLI-003` owns the single-repository inventory representation this item will reuse.

## Steps

1. Define workspace storage and grammar for creating, listing, inspecting, and removing named repository sets.
2. Implement physical-root validation, duplicate detection, deterministic ordering, and clear diagnostics for missing or non-KI roots.
3. Add a read-only aggregate plan-list command that reuses `KI-TOOL-CLI-003` inventory and isolates every repository result or diagnostic.
4. Add black-box contracts for workspace persistence, validation, ordering, mixed outcomes, and read-only list operations.
5. Document the read-only coordination boundary.

## Files touched

- `src/commands/`, `src/core/`, configuration/path modules, registration, and completions
- `src/tests/cli/` workspace and aggregate inventory contracts
- `man/ki.1`, README, and user documentation

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contracts prove physical-root validation, deterministic aggregate output, isolated diagnostics, and no list mutation.

## Dependencies / blocks

This item is blocked by [KI-TOOL-CLI-003](KI-TOOL-CLI-003-add-native-governed-plan-inventory.md).
