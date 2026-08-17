---
id: KI-TOOL-CLI-047
title: Modularise core services
area: CLI
theme: cli
horizon: next
status: done
blocks: []
blocked_by: []
baseline_ref: f86666e9eaef4a89da38e235216f47c1f68fe1f7
---

## Goal

Reorganise the largest `src/core` services into cohesive, purpose-led domains while preserving CLI behaviour and explicit capability boundaries.

## Context

`src/core` had grown into a flat collection of unrelated concerns. Trade, repository, rubric, runtime, storage, and presentation code were difficult to navigate and evolve independently.

## Boundary

This is a comprehension-first structural refactor. It does not change public CLI behaviour, trade semantics, injected `KiContext` capabilities, or introduce compatibility shims.

## Current state

The core tree is organised into focused domains: Agora, configuration, harness, KEP, presentation, repository, rubric, runtime, storage, trade, and work. Repository progress, reporting, and subprocess services now live under the repository boundary; root modules are infrastructure primitives.

## Steps

- [x] Map `trade-core.ts` exports and CLI consumers into lifecycle, repository discovery, payload projection, and filesystem-persistence responsibilities.
- [x] Extract self-contained trade services behind focused barrels with explicit data types and `KiContext` dependencies.
- [x] Move remaining core responsibilities into coherent domain folders and subfolders, keeping command-facing imports at focused entry points.
- [x] Remove redundant helpers and imports created by the split without retaining legacy forwarding paths or altering trade record semantics.
- [x] Exercise affected command routes exclusively through `sandbox()` and retain 100% product-code coverage.

## Check

- `bun run test`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bunx biome check`
- `ki repo audit --repo .`

## Documentation impact

No operator-facing guide changes are required. This record retains the architectural delivery evidence; CLI-049 carries the next command/core and agent-boundary refinement.

## Review

### Delivered

Reorganised `src/core` into focused domains for trade, repository, rubric, storage, presentation, harness, runtime, configuration, work, Agora, and KEP.

### Summary of changes

Each domain exposes a narrow entry point and contains its collaborating modules. Imports were migrated rather than shimmed, preserving the existing CLI contract while making future extraction and ownership clearer.

### Verification

The full repository test, coverage, type-check, formatting, and audit gates passed after the refactor.

### Outstanding concerns

None.

### Post-change review

The command contract, injected `KiContext` capabilities, and trade semantics remain unchanged. Terminal presentation remains a core domain for now; CLI-049 records moving terminal-facing rendering to the command layer and introducing streamed core operation events.

### Mini recap

CLI-047 completed the structural core refactor without changing user-facing behaviour.

## Done

Accepted by the repository owner on 2026-08-17. The refactor is retained as the durable completion record.

## Discussion

No further work is required by this record.
