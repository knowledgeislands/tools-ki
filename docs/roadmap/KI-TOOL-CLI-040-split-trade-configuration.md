---
id: KI-TOOL-CLI-040
area: CLI
title: Split trade configuration
theme: cli
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Make trade configuration and route mutation understandable as one focused module, while leaving trade-record lifecycle behaviour unchanged.

## Context

`src/core/trade-core.ts` is 1,161 lines and currently combines two independent domains: parsing and rewriting `[skills.ki-trades]` declarations, and operating trade records through preparation, submission, receipt, observation, release, and pruning. The configuration domain is already cohesive: it owns the trade kinds and policies, TOML validation, route declarations, and add/remove route mutations. It has direct command consumers in `commands/trade/routes.ts` and `commands/trade/shared.ts`.

## Boundary

Do not alter any trade protocol, TOML schema, CLI output, or record lifecycle semantics. Do not split record parsing, observation, release, or cleanup in this item. Do not retain compatibility re-exports from `trade-core.ts`; update internal callers to the configuration module directly.

## Current state

The first 345 lines of `trade-core.ts` contain configuration models, validators, TOML parsing and rendering, and route mutation. The remainder operates repositories, routes in an estate, and trade-record lifecycle. This mixed surface makes it harder to locate the contract that a configuration change affects.

## Steps

- [ ] Extract the trade configuration types, validators, parsing, rendering, and route mutations to `src/core/trade-configuration.ts`.
- [ ] Update trade-core and command consumers to import their owning configuration contract directly, with no compatibility re-export.
- [ ] Verify exact CLI trade contracts, type safety, coverage, formatting, and the intended internal import boundary.

## Files touched

- `src/core/trade-configuration.ts`
- `src/core/trade-core.ts`
- `src/commands/trade/routes.ts`
- `src/commands/trade/shared.ts`
- `src/tests/cli/trade/trade.test.ts`

## Verify

- `bunx vitest run src/tests/cli/trade/trade.test.ts`
- `rg -n "readTradeConfiguration|addTradeRoute|removeTradeRoute|isTradeKind|isObservationPolicy" src --glob '*.ts'`
- `bunx tsc --noEmit`
- `bun run test:coverage`
- `bunx @biomejs/biome check src/core/trade-configuration.ts src/core/trade-core.ts src/commands/trade/routes.ts src/commands/trade/shared.ts src/tests/cli/trade/trade.test.ts`

## Dependencies / blocks

No local dependency blocks this refactor. Existing end-to-end trade command tests cover route declaration, mutation, observation, release, and cleanup.

## Discussion

### Chosen seam

Configuration is a natural module boundary because its inputs and outputs are the repository declaration, an in-memory `TradeConfiguration`, and deterministic declaration writes. Trade-record lifecycle depends on configuration but does not own its syntax or mutation. Extracting it reduces `trade-core.ts` without changing the protocol or inventing a generic layer.

### Deferred seams

After this extraction, record parsing and lifecycle orchestration can be assessed on their own evidence. `repository-reporting.ts` is also large but already contains two related reporting modes—progress and final frames—and requires a separate cohesion review before any split. The repository command factory has discrete `init`, audit, and conform branches, but moving them should wait until their command-registration and shared-selection seams are explicitly designed.
