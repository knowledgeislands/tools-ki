---
id: 'CLI-001'
title: 'Define `ki missing` and `ki outdated` capability status'
status: ready
roadmap: cli/define-ki-missing-and-ki-outdated-capability-status
blocks: —
blocked-by: —
baseline-ref: —
---

## Context

Before KI adds capability lifecycle and update operations, users need read-only answers to two distinct questions: which desired capabilities are unavailable locally, and which installed capability sources have explicit newer-release evidence. The answers must preserve the separation between the XDG-managed verified harness registry, user activation, and the repository declaration resolved from the current working directory.

## Current state

- `ki harness list` inventories installed harnesses, `ki doctor` reports a limited user-environment health view, and `ki skill` changes user or repository activation.
- No public `ki missing` or `ki outdated` command explains desired capability availability or release freshness.
- Harness acquisition currently verifies immutable URL and SHA-256 evidence, and the installed `latest` slot has no user-selectable version. A status command must not claim freshness without explicit comparable release evidence or perform an unrequested network update check.

## Steps

1. Define the read-only status contract for `ki missing` and `ki outdated`: desired user and CWD-resolved repository capabilities, installed verified harnesses, applicable release evidence, output and exit semantics, and the honest outcome when no comparable freshness evidence exists.
2. Add a shared host-owned capability-status collector that reads user configuration, an optional resolved repository declaration, the installed harness inventory, and configured immutable release evidence without mutating state or using network access.
3. Implement `ki missing` and `ki outdated` using that collector, with deterministic human output and explicit distinctions between unavailable capabilities, installed sources, active declarations, and unavailable freshness evidence.
4. Register the commands, update help, completion coverage, `ki(1)`, and the V1 capability baseline without exposing later lifecycle or update commands prematurely.
5. Add CLI-contract tests for empty and configured state, user and repository scopes, missing providers, ambiguous or malformed state, stable ordering, no-network status execution, and unchanged failure semantics; keep full coverage intact.

## Files touched

- `src/commands/` command registration and status-command modules
- `src/core/` status collection and existing registry, harness, configuration, or repository seams where needed
- `src/tests/cli/` CLI-contract coverage
- `man/ki.1`
- `CHANGELOG.md`

## Verify

1. `ki missing --help` and `ki outdated --help` describe only the approved read-only status contracts.
2. Sandboxed CLI tests prove deterministic output for no configuration, installed and missing harnesses, user activation, a CWD-resolved repository declaration, and absent comparable release evidence without network access.
3. `bun run test` and `bun run test:coverage` pass with the repository's required 100% coverage thresholds.
4. `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bash -n install.sh`, `bunx prettier --check CHANGELOG.md man/ki.1`, and `git diff --check` pass.
5. `ki missing`, `ki outdated`, and their help output work against the current local installation without changing XDG or repository state.

## Dependencies / blocks

This plan is independent. Its contract becomes the read-only foundation for the later capability lifecycle and update–upgrade roadmap items, but it does not add mutation or executable self-update behavior.
