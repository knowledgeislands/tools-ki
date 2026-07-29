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

Let a user define a KI-owned `.ki-workspace.toml` in a parent directory, name explicit repository groups through `ki workspace`, and query their governed-work inventory through repository-scoped commands.

When `ki repo` runs from a directory containing that regular workspace file, its declared default group should take precedence over the direct-CWD `.mgitconfig` fallback. This makes KI workspaces the explicit authority while retaining `mgit` compatibility as an optional selector.

## Boundary

This item does not recursively scan ambient folders, replace Git or `mgit`, search ancestors for a workspace file, introduce mutation fan-out, or take ownership of governed-plan lifecycle transitions.

## Current state

The CLI has no persisted workspace definition or aggregate work-item view. `KI-TOOL-CLI-003` owns the read-only per-repository inventory representation this item will reuse, and `KI-TOOL-CLI-006` owns the reusable target-set resolver.

### Workspace and selection contract

A regular `.ki-workspace.toml` in the physical current directory will declare `schema = 1`, a `default` group, and named groups whose relative repository paths or patterns resolve from the workspace directory. `ki workspace` will initialise, list, inspect, add, and remove those groups without needing a KI repository in the current directory.

Repository-scoped commands will accept `--workspace <group>` and resolve that named group from the direct-CWD workspace file. `--repo` and `--workspace` are mutually exclusive explicit selectors. With neither supplied, target selection is: the direct-CWD workspace default group, then the direct-CWD `.mgitconfig`, then normal single-repository discovery. No selector searches an ancestor workspace or `mgit` configuration.

## Steps

1. Define the direct-CWD `.ki-workspace.toml` schema and `ki workspace` grammar for initialising, listing, inspecting, adding, and removing named repository groups and their default.
2. Extend repository target selection with mutually exclusive `--repo` and `--workspace` selectors, then direct-CWD workspace-default, `.mgitconfig`, and single-repository fallback precedence.
3. Reuse the CLI-006 resolver for workspace-relative physical-root validation, duplicate detection, deterministic ordering, and clear missing or non-KI diagnostics.
4. Make `ki repo --workspace <group> plan list` reuse CLI-003 inventory results and isolate every repository result or diagnostic.
5. Add black-box contracts for workspace persistence, group validation, selector precedence, ordering, mixed outcomes, and read-only inventory operations.
6. Update help, completions, `ki(1)`, README, developer guidance, and the non-blocking `ki-website` handoff with the workspace authority and lifecycle boundary.

## Files touched

- `src/commands/`, `src/core/`, configuration/path modules, registration, and completions
- `src/tests/cli/` workspace and aggregate inventory contracts
- `man/ki.1`, README, developer documentation, and a non-blocking KI Website handoff for public user guidance

## Verify

1. `bunx tsc --noEmit`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contracts prove workspace-root containment, schema validation, explicit-selector conflict handling, direct-CWD precedence over `.mgitconfig`, deterministic aggregate output, isolated diagnostics, and no list mutation.

## Dependencies / blocks

This item is blocked by [KI-TOOL-CLI-003](KI-TOOL-CLI-003-add-native-governed-plan-inventory.md).

## Discussion

### Workspace ownership

A workspace is a named KI-owned definition of physical KI repository roots, not a replacement for Git discovery, `mgit`, or an ambient-directory scan. A direct-CWD workspace file is authoritative only for its declared default or an explicit group; no ancestor configuration silently changes a repository command's meaning.

### Selector precedence

An explicit `--repo` or `--workspace` makes a caller's intent unambiguous, so the two selectors are rejected together rather than silently applying one. Without either selector, the direct-CWD `.ki-workspace.toml` default comes before direct-CWD `.mgitconfig`; ordinary repository discovery remains the final fallback.

### Aggregate boundary

The aggregate operation reuses CLI-003's inventory representation and runs read-only. A missing, invalid, or unavailable member produces an isolated diagnostic; it neither removes the member from the workspace nor prevents independent members from being reported.

### Dependency boundary

CLI-003 supplies the inventory contract and CLI-006 supplies multi-target resolution. This item should add persistence and named coordination only after both contracts are delivered.
