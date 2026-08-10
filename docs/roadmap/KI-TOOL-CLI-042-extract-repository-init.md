---
id: KI-TOOL-CLI-042
area: CLI
title: Extract repository initialization
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 0314bddd97e1dbc8a6f0ada800bb1d4a76ef318e
---

## Goal

Give repository initialization a focused command module while preserving the repository command factory as the composition boundary.

## Context

`src/commands/repo/index.ts` is 494 lines and combines root command setup, child-command registration, repository initialization, audit, conform, shared target resolution, and local registry integration. The `init` branch is self-contained: it owns its options, repository resolution, atomic declaration and local-registry writes, and CLI output.

## Boundary

Do not change initialization semantics, configuration shape, atomic-write behaviour, or public command grammar. Do not extract audit or conform orchestration in this item; they share selection and reporting flow that needs a separate design.

## Current state

The `init` command occupies one distinct branch in the repository factory but has no dedicated module, unlike roadmap, diagnostics, repair, skills, and upgrades. Its direct CLI tests already define its public contract.

## Steps

- [x] Move the `ki repo init` command construction and implementation to `src/commands/repo/init.ts`.
- [x] Reduce the repository factory to root setup, shared selection, and child-command composition.
- [x] Prove exact initialization success, validation, rollback, and option-isolation contracts at the CLI boundary.

## Files touched

- `src/commands/repo/init.ts`
- `src/commands/repo/index.ts`
- `src/tests/cli/registry/registry.test.ts`

## Verify

- `bunx vitest run src/tests/cli/registry/registry.test.ts`
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx @biomejs/biome check src/commands/repo/init.ts src/commands/repo/index.ts src/tests/cli/registry/registry.test.ts`

## Dependencies / blocks

No local dependency blocks this extraction. The `init` branch is independent of the planned progress and trade-configuration refactors.

## Delegation

A worker may inspect or perform the mechanical `init` extraction only within the listed files. The orchestrator reviews the atomic-write and command-isolation evidence and runs the full stated verification before this item can reach review.

## Review

### Delivered

Repository initialization now has a focused command module, leaving the repository factory as a command-composition boundary.

### Summary of changes

Moved init option parsing, validation, transactional writes, rollback, and output unchanged to `commands/repo/init.ts`.

### Verification

The 18-contract initialization and registry suite, `bunx tsc --noEmit`, `bun run test:coverage`, and Biome passed.

### Outstanding concerns

None. Initialization grammar and atomicity are unchanged.

### Post-change review

Sol found no substantive issue in this extraction.

### Mini recap

The initialization branch was a true command seam and no new abstraction was needed.

## Discussion

### Chosen seam

Initialization has a complete command boundary and a dedicated acceptance suite. Extracting it makes the factory a clearer composition point without forcing unrelated audit or conform behaviour through a new abstraction.
