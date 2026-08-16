---
id: KI-TOOL-CLI-047
title: Modularise core services
area: CLI
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Make the largest `src/core` responsibilities easier to understand and change by separating cohesive services behind stable, purpose-led module boundaries.

## Context

`src/core` contains 6,400 lines across 31 modules. `trade-core.ts` alone is 965 lines and combines trade records, lifecycle transitions, local discovery, projection, and filesystem orchestration, obscuring its separate responsibilities.

## Boundary

This is a comprehension-first structural refactor. Preserve public CLI behaviour, trade semantics, injected `KiContext` capabilities, and CLI-contract coverage. Do not add compatibility shims, cache results, alter another repository, or combine unrelated feature work.

## Current state

Core modules can be imported directly by commands, while the largest trade module has several cohesive but interleaved concerns. The initial refactor target is the trade lifecycle and discovery boundary; other large modules remain out of scope unless the extraction requires a shared type-only dependency.

## Steps

- [ ] Map `trade-core.ts` exports and CLI consumers into lifecycle, repository discovery, payload projection, and filesystem-persistence responsibilities; record the intended ownership before moving code.
- [ ] Extract the first self-contained trade service behind a focused barrel, keeping its explicit data types and `KiContext` dependencies visible at the module boundary.
- [ ] Move remaining trade responsibilities only where the resulting modules have one clear purpose and the public command-facing import surface stays coherent.
- [ ] Remove redundant helpers and imports created by the split, without retaining legacy forwarding paths or altering trade record semantics.
- [ ] Exercise the affected command routes exclusively through `sandbox()` and retain 100% product-code coverage alongside the repository gates.

## Files touched

- `src/core/trade-core.ts` and new focused `src/core/trade-*.ts` modules — trade-service extraction.
- `src/commands/` — only import adjustments required by the new core boundary.
- `src/tests/cli/` — end-to-end CLI contract evidence through `sandbox()`.
- `docs/roadmap/KI-TOOL-CLI-047-modularise-core-services.md` — delivery and review evidence.

## Verify

- `bun run test`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bunx biome check`
- `ki repo audit --repo .`

## Dependencies / blocks

No local work-item dependencies. The refactor is independent of `KI-TOOL-CLI-046` and `KI-TOOL-CLI-048` but must preserve their trade and host contracts.

## Documentation impact

### Decision Records

No decision record is expected: the work applies the repository's existing comprehension-first modularity convention.

### Specifications

No specification change is expected because the public CLI and trade semantics remain unchanged.

### Guides

No guide change is expected because the operator workflow remains unchanged.

### Roadmap

This record retains the planned structural refactor so the `src/core` concern is not lost behind feature delivery.

## Discussion

If the initial mapping identifies independent scopes that cannot share an atomic CLI-contract verification cycle, split them into follow-on records before implementation rather than broadening this refactor.
