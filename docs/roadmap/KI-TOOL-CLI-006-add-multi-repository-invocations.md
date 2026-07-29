---
id: KI-TOOL-CLI-006
title: Add multi-repository invocations
theme: cli
horizon: next
status: ready
blocks: [KI-TOOL-CLI-003]
blocked-by: [KI-TOOL-CLI-005]
baseline-ref: null
---

## Context

Extend every `ki repo` operation from one resolved repository to an explicit, repeatable target set. Repeated `[--repo <path>]` options let a caller audit, conform, diagnose, manage skills, or upgrade selected repositories in one invocation without an ambient recursive scan.

## Boundary

This item does not persist named workspaces, recursively discover folders, add multi-repository support to user commands, or introduce all-or-nothing rollback across repository mutations.

## Current state

`KI-TOOL-CLI-005` establishes the repository-only command boundary and exact single-path resolution. Each `ki repo` operation presently receives one repository and reports one result. The next inventory item needs this common multi-target boundary rather than a bespoke fan-out implementation.

## Steps

1. Define repeatable `[--repo <path>]` grammar and target ordering for every `ki repo` operation, including the no-option single-CWD discovery case.
2. Implement a shared multi-target resolver that validates every supplied root before operations begin, rejects duplicate physical roots deterministically, and never discovers the CWD when any explicit target is present.
3. Refactor repository operations to run resolved targets in supplied order with concise per-repository reporting. For mutations, retain earlier successful targets when a later target fails and return a non-zero overall result.
4. Add black-box CLI contracts for multi-target audit, conform, diag, skill activation, and upgrade; prove preflight failure performs no operation and duplicate or invalid targets report clear diagnostics.
5. Update help, completions, `ki(1)`, README, and user documentation to show repeated `[--repo <path>]` syntax and incremental mutation behaviour.

## Files touched

- `src/commands/`, repository-resolution modules, and command registration/completions
- `src/tests/cli/` multi-target repository contracts
- `man/ki.1`, README, and user documentation

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. CLI contracts prove all-target preflight, supplied-order execution, no CWD discovery with explicit targets, isolated per-repository diagnostics, and retained earlier mutations after a later failure.

## Dependencies / blocks

This item is blocked by [KI-TOOL-CLI-005](KI-TOOL-CLI-005-align-command-scopes-and-repository-resolution.md). It blocks [KI-TOOL-CLI-003](KI-TOOL-CLI-003-add-native-governed-plan-inventory.md).
