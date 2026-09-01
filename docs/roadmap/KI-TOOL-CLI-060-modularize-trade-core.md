---
id: KI-TOOL-CLI-060
area: CLI
title: Modularize trade lifecycle core
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
---

# Modularize trade lifecycle core

## Goal

Turn the trade domain entry point into a readable barrel over cohesive lifecycle modules without changing the public trade protocol or CLI contract.

## Context

`src/core/trade/index.ts` currently combines estate discovery, record decoding, payload projection, lifecycle decisions, and several mutation paths. The domain already has focused configuration, identifier, payload, route, and operation modules, but the remaining entry point obscures boundaries that already exist conceptually.

## Boundary

Do not change trade file formats, lifecycle semantics, command output, route configuration, observation policy, cross-repository authority, or public exports. Do not split functions solely to reduce line count or introduce compatibility shims.

## Current state

`src/core/trade/index.ts` is a 951-line domain entry point that owns the public trade model, registered-estate and route resolution, record codec and paths, sender preparation, receiver delivery and observation, estate inventory, lifecycle evaluation, and cleanup mutations. `configuration.ts`, `identifiers.ts`, `payload.ts`, `routes.ts`, and `operations/` already establish partial domain boundaries, while command callers consistently consume `core/trade/index.ts` as the public facade. Existing CLI contract tests cover the complete trade lifecycle and repository-roadmap projection. Five coverage guards rely on CLI validation and must be revalidated against every caller when moved.

## Steps

- [ ] Freeze the current `core/trade/index.ts` export map, call graph, error text, and coverage-guard justifications before moving code.
- [ ] Extract the public trade model and registered-estate/route resolution into cohesive leaf modules without broadening the facade.
- [ ] Extract record decoding, validation, rendering, phase handling, and storage paths into one codec boundary that preserves parsed-meaning comparison.
- [ ] Extract sender preparation and receiver delivery/observation flows behind the unchanged public operations.
- [ ] Extract physical trade inventory, lifecycle evaluation, and release/prune mutations while preserving deterministic ordering and safety checks.
- [ ] Replace `index.ts` with an explicit barrel, update sibling core imports to avoid cycles, and remove any dead exports reported by Knip.
- [ ] Verify all behavior through the existing CLI seam, then update the developer module map and attach final evidence.

## Files touched

- `src/core/trade/index.ts`
- `src/core/trade/model.ts`
- `src/core/trade/estate.ts`
- `src/core/trade/record-codec.ts`
- `src/core/trade/preparations.ts`
- `src/core/trade/delivery.ts`
- `src/core/trade/inventory.ts`
- `src/core/trade/lifecycle.ts`
- `src/core/trade/payload.ts`
- `src/core/trade/routes.ts`
- `src/core/trade/operations/`
- `src/core/work/operations.ts`
- `docs/guides/developer/local-development.md`
- `docs/roadmap/KI-TOOL-CLI-060-modularize-trade-core.md`

## Verify

- `src/tests/cli/trade/trade.test.ts` passes unchanged and continues covering preparation, observation, submission, receipt, listing, route inspection, release, and prune contracts.
- `src/tests/cli/repo/roadmap.test.ts` passes unchanged and continues projecting trade context through `ki repo roadmap list`.
- Public command imports continue resolving only through `src/core/trade/index.ts`; no new circular dependency or unintended public export remains.
- `bunx vitest run src/tests/cli/trade/trade.test.ts src/tests/cli/repo/roadmap.test.ts`, `bunx tsc --noEmit`, `bunx knip --reporter compact`, `bun run test:coverage`, `bun run build`, and the complete repository audit pass.

## Dependencies / blocks

No work-item dependency. The implementation must not overlap an active trade-protocol change in `src/core/trade/`; no such overlap was present during shaping. It is independent of `KI-TOOL-CLI-058`, `KI-TOOL-CLI-059`, and `KI-TOOL-CLI-061`. Parallel implementation is safe by source ownership, with shared full-suite and audit gates run sequentially after lanes converge.

## Delegation

One implementation lane should own the complete trade-core move because the leaf modules share a public facade and internal dependency graph. It may run in parallel with Agora and runtime lanes; orchestration retains final import-cycle, export-surface, coverage, and repository-audit review.

## Documentation impact

### Decision Records

No Decision Record expected. The work realizes the existing core-domain/barrel architecture without changing the trade protocol or choosing a new system boundary.

### Specifications

No specification change expected because public trade behavior, errors, lifecycle semantics, and mutation rules remain unchanged.

### Guides

Update `docs/guides/developer/local-development.md` only to name the resulting trade-core module boundaries and facade rule.

### Roadmap

Check each extraction and verification step, record the exact final module map, and attach the review packet evidence before moving the record to awaiting review.

## Discussion

The split is justified by independently cohesive responsibilities, not file length. Preserve exact command behavior and explicit public exports; do not introduce compatibility shims, new abstractions around one-off helpers, internal unit tests, or protocol/documentation changes. If an extraction requires a behavioral change, stop and capture that separately rather than folding it into this refactor.
