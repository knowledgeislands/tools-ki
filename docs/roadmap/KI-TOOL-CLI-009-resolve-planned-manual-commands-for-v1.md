---
id: KI-TOOL-CLI-009
title: Resolve planned manual commands for V1
theme: cli
horizon: blocking
status: in-progress
blocks: []
blocked-by: []
baseline-ref: 84c88ca5ed39f8e2af5b42874a417aba6020095b
---

## Context

Promote `ki search`, `ki cleanup`, and `ki docs` into the intended V1 public surface, then implement them. The manual and changelog publish that surface ahead of implementation so review has one complete V1 command inventory rather than a mixture of shipped and `*`-prefixed entries.

`ki search` searches the available capability set, `ki cleanup` removes managed stale state, and `ki docs` opens or prints the appropriate KI documentation location. Their exact safe operational contracts still need to be defined before implementation.

## Boundary

Do not broaden these commands into external marketplace search, browser automation, or destructive unmanaged-file removal. The changelog remains a concise V1 command baseline; options and operational detail belong in `ki(1)` and user guides.

## Current state

The source currently registers none of these commands. The manual and changelog now name them as intended V1 commands; implementation follows a reviewed definition of their local capability-search, managed-cleanup, and documentation-routing semantics.

## Steps

1. Publish `ki search`, `ki cleanup`, and `ki docs` in the manual and changelog, remove the obsolete `*` marker explanation, and make the manual describe the intended V1 surface.
2. Define each command’s exact input, local data sources, output, error handling, and mutation boundary; obtain review before implementation.
3. Implement the approved contracts with black-box CLI tests and update help, completions, manual, and user guides.
4. Render and inspect the manual, then verify the runtime exposes each command without any `*`-prefixed planned interface.
5. Perform a post-implementation CLI-surface audit: compare command registration, root and command help, completion inventory, documentation, and black-box contracts against the intended V1 command inventory. Record and resolve every discrepancy before acceptance.

## Files touched

- `src/commands/`, `src/tests/cli/`, completions, and relevant core modules
- `man/ki.1`, `CHANGELOG.md`, README, and user guides

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `mandoc -Tutf8 man/ki.1 | col -b` renders the intended V1 manual.
4. `rg '\\\*ki (search|docs)|unreleased development surface' man/ki.1` has no matches.

5. The post-implementation CLI-surface audit finds no undocumented command, documented-but-unregistered command, stale completion, or missing black-box command contract.

## Dependencies / blocks

This item is independent of KI-TOOL-CLI-008’s code changes, but both must complete before further CLI-surface work resumes.

## Delegation

The V1 command names and their one-line purpose are locked. Exact operational contracts are an orchestrator judgment checkpoint and must not be invented by a worker. Once approved, a bounded implementation worker may own code and tests; the orchestrator reviews the diff and runs final verification.
