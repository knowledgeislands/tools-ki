---
id: KI-TOOL-CLI-061
area: CLI
title: Modularize runtime operation core
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
---

# Modularize runtime operation core

## Goal

Turn the runtime domain entry point into a readable barrel over cohesive preparation, audit, education, and conform modules without changing rubric execution behavior.

## Context

`src/core/runtime/index.ts` currently combines public types, preparation, catalogue execution, education, audit, and conform behavior. The repository operations consume those responsibilities independently, while the core entry point leaves the boundaries difficult to see and maintain.

## Boundary

Do not change rubric contracts, execution ordering, progress events, conform safety, finding levels, coverage policy, or public command output. Do not create internal unit tests or abstractions whose only purpose is reducing file size.

## Current state

`src/core/runtime/index.ts` is 587 lines and combines public runtime contracts, rubric preparation, audit evidence and execution, education projection, conform execution, and fixed-item detection. Repository operations already consume those responsibilities independently through the runtime barrel. Existing CLI contracts cover session and outcome validation, progress reporting, package-script claim ordering, audit and education output, conform safety, guarded publication, and fixed-item reporting. The sole runtime coverage guard protects `detectFixed` against an impossible mismatch between a conform result and the fresh re-audit of the same rubric catalogue.

## Steps

- [ ] Extract shared runtime data contracts into `types.ts` without changing their names or shapes.
- [ ] Extract rubric loading, mechanical-item ordering, and package-script claim aggregation into `preparation.ts`.
- [ ] Extract evidence gathering, progress and session validation, subject execution, finding projection, and audit entry points into `audit.ts`.
- [ ] Extract the static catalogue projection used by repository education into `education.ts`.
- [ ] Extract conform proposal validation, remediation ordering and execution, and fixed-item detection into `conform.ts`, preserving every safety rule and the existing coverage-guard rationale.
- [ ] Replace `index.ts` with an explicit barrel preserving the current public runtime surface and keep internal cross-module helpers out of that barrel.
- [ ] Remove runtime publication's repository-barrel back-edge through direct type and subprocess imports.
- [ ] Refresh the developer module map and verify unchanged behavior through the existing CLI contracts.

## Files touched

- `src/core/runtime/index.ts`
- `src/core/runtime/types.ts`
- `src/core/runtime/preparation.ts`
- `src/core/runtime/audit.ts`
- `src/core/runtime/education.ts`
- `src/core/runtime/conform.ts`
- `src/core/runtime/publication.ts`
- `docs/guides/developer/local-development.md`
- `docs/roadmap/KI-TOOL-CLI-061-modularize-runtime-core.md`

## Verify

- Run the repository CLI contract suites covering repository validation, audit and education, progress stages, conform execution, conform writes, user-home scope, and rubric publication.
- Confirm no test imports product internals and add no internal unit-test seam solely for the extraction.
- Confirm audit and conform execution order, progress events, findings, exit codes, proposed writes and commands, and fixed-item reporting remain unchanged.
- Run `bun run test:coverage`, `bun run build`, `bunx tsc --noEmit`, `bunx biome check`, `bunx knip --reporter compact`, and `ki repo audit --repo .`.

## Dependencies / blocks

No local product dependency. The work is independent of `KI-TOOL-CLI-058`, `KI-TOOL-CLI-059`, and `KI-TOOL-CLI-060` and may run in parallel with them. Coordinate only any concurrent edit to the developer module map.

## Delegation

Treat this record as one cohesive implementation lane because its shared contracts and audit/conform imports must move together. It may execute in parallel with the path-disjoint Agora and trade records, with lifecycle transitions and the final repository gate retained by the batch orchestrator.

## Documentation impact

### Decision Records

No Decision Record expected. This is an internal responsibility extraction that preserves the accepted runtime architecture and public behavior.

### Specifications

No specification change expected because rubric contracts, execution behavior, output, and exit semantics remain unchanged.

### Guides

Update the developer module map to name the runtime preparation, audit, education, and conform boundaries.

### Roadmap

Attach the completed steps and verification evidence to this record before moving it to awaiting review.

## Discussion

The split follows stable runtime responsibilities already visible at repository-operation call sites rather than using file length as the design criterion. Audit owns validation associated with constructing and executing audit evidence; conform owns proposal validation and remediation safety. Shared contracts remain dependency-neutral, and the explicit barrel preserves the current caller surface without exposing internal coordination helpers. `publication.ts` and `runner.ts` remain separate cohesive runtime services.
