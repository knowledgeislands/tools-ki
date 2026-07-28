---
id: 'KI-CLI-CLI-004'
title: Add explicit KI workspaces
status: open
roadmap: cli/add-explicit-ki-workspaces
blocks: —
blocked-by: KI-CLI-CLI-003
baseline-ref: —
---

## Context

Users need an KI-aware view across selected repositories without relying on an ambient recursive scan or a generic multi-Git wrapper. This plan introduces named, explicit workspaces and a read-only aggregate plan view built on the native single-repository inventory.

## Current state

The CLI resolves one current or `--repo` repository at a time. It has no persisted workspace definition, aggregate repository reporting, or multi-repository plan discovery; `ki repo`'s multi-style progress rendering concerns skills within one repository, not multiple repositories.

## Steps

1. Define the workspace storage location and command grammar for creating, listing, inspecting, and removing named explicit repository sets.
2. Implement strict physical-root validation, duplicate detection, deterministic ordering, and clear diagnostics for absent or no-longer-KI repositories.
3. Add a read-only aggregate plan-list command that reuses `KI-CLI-CLI-003`'s inventory representation and isolates each repository's result or diagnostic.
4. Add black-box CLI contract tests covering workspace persistence, validation, aggregate ordering, mixed repository outcomes, and zero mutation during list operations.
5. Document the boundary: workspaces coordinate KI-aware read-only visibility first; they neither replace Git nor fan out mutations in this capability.

## Files touched

- `src/commands/`, `src/core/`, configuration/path modules, and CLI registration/completions
- `src/tests/cli/` workspace and aggregate-inventory contracts
- `man/ki.1`, README, and user documentation for workspace usage and boundaries

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contract tests prove physical-root validation, deterministic aggregate output, isolated diagnostics, and no mutation from workspace plan listing.

## Dependencies / blocks

This plan is blocked by `KI-CLI-CLI-003` because aggregate workspace output must reuse the settled single-repository inventory contract. No external repository needs to change for the read-only first capability.
