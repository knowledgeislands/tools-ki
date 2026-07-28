---
id: 'KI-CLI-CLI-003'
title: Add native governed-plan inventory
status: open
roadmap: cli/add-native-governed-plan-inventory
blocks: KI-CLI-CLI-004
blocked-by: —
baseline-ref: —
---

## Context

Governed plans already have a stable on-disk representation, but users must currently inspect Markdown manually or invoke an agent process skill to discover them. This plan adds a read-only native CLI inventory so people and future workspace commands can see the real plan queue without making `ki` the owner of plan lifecycle semantics.

## Current state

`ki repo` resolves exactly one KI repository, and the public CLI exposes no `plan` command. The harness owns plan format and lifecycle; the current thematic roadmap model provides repository-qualified IDs, canonical roadmap locators, statuses, dependency edges, and optional baseline references.

## Steps

1. Define the `ki plan list` contract, including repository resolution, text and machine-readable output, filters, ordering, empty states, and malformed-plan diagnostics.
2. Implement a read-only plan-record reader that validates containment and derives inventory fields from the canonical roadmap and plan files without performing lifecycle transitions.
3. Add the `plan` command group and register it in CLI help and shell completions, preserving the existing `ki-plan` skill's ownership of ready, execute, accept, done, and prune transitions.
4. Add black-box CLI contract tests for thematic repositories with active, retained, malformed, filtered, and empty plan sets.
5. Update the manual and user documentation with the command contract and the boundary between inventory and lifecycle management.

## Files touched

- `src/commands/`, `src/core/`, and CLI registration/completion modules
- `src/tests/cli/` plan-inventory fixtures and contracts
- `man/ki.1`, README, and user documentation for the public command surface

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contract tests prove deterministic inventory, filtering, malformed-record diagnostics, and no on-disk mutation.

## Dependencies / blocks

This plan has no blockers. It blocks [KI-CLI-CLI-004](KI-CLI-CLI-004-add-explicit-ki-workspaces.md), which will reuse its inventory boundary across an explicit workspace.
