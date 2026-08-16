---
id: KI-TOOL-CLI-047
title: Modularise core services
area: CLI
theme: cli
horizon: next
status: in-progress
blocks: []
blocked_by: []
baseline_ref: f86666e9eaef4a89da38e235216f47c1f68fe1f7
---

## Goal

Make the largest `src/core` responsibilities easier to understand and change by separating cohesive services behind stable, purpose-led module boundaries.

## Context

`src/core` contains 6,400 lines across 31 modules. `trade-core.ts` alone is 965 lines and combines trade records, lifecycle transitions, local discovery, projection, and filesystem orchestration, obscuring its separate responsibilities.

## Boundary

This is a comprehension-first structural refactor. Preserve public CLI behaviour, trade semantics, injected `KiContext` capabilities, and CLI-contract coverage. Group coherent core domains behind focused entry points without compatibility shims, caching, or unrelated feature work.

## Current state

Trade, repository, and rubric domains now have focused entry points. The remaining flat clusters include storage, presentation, and harness/acquisition responsibilities; this record continues until core ownership is consistently visible in the directory structure.

## Steps

- [x] Map `trade-core.ts` exports and CLI consumers into lifecycle, repository discovery, payload projection, and filesystem-persistence responsibilities; record the intended ownership before moving code.
- [x] Extract the first self-contained trade service behind a focused barrel, keeping its explicit data types and `KiContext` dependencies visible at the module boundary.
- [ ] Move remaining core responsibilities into coherent domain folders and subfolders where useful, keeping command-facing imports at focused entry points.
- [x] Remove redundant helpers and imports created by the split, without retaining legacy forwarding paths or altering trade record semantics.
- [x] Exercise the affected command routes exclusively through `sandbox()` and retain 100% product-code coverage alongside the repository gates.

## Files touched

- `src/core/` domain folders — focused trade, repository, rubric, storage, presentation, and harness/acquisition boundaries.
- `src/commands/` and `src/agents/` — only import adjustments required by the new core boundaries.
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

## Review

### Delivered

Moved the trade domain behind `src/core/trade/index.ts`, with focused identifier validation and sender-payload evidence modules.

### Summary of changes

`trade/identifiers.ts` owns address and identifier validation, while `trade/payload.ts` owns the portable sender-payload projection used for receiver integrity checks. Commands and internal consumers now import the domain entry point.

### Verification

Passed `bun run test`, `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check`, and `ki repo audit --repo .`.

### Outstanding concerns

None.

### Post-change review

The extraction leaves `KiContext` and filesystem orchestration in the host boundary, and moves only pure, named concerns. Existing CLI trade tests exercise the unchanged public routes.

### Mini recap

CLI-047 makes the first deliberate reduction in `trade-core.ts`; larger core modules remain explicitly out of scope for this record.

## Discussion

If the initial mapping identifies independent scopes that cannot share an atomic CLI-contract verification cycle, split them into follow-on records before implementation rather than broadening this refactor.
