---
id: KI-TOOL-CLI-019
title: Re-engineer feature definitions
theme: cli
horizon: next
status: draft
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Give `tools-ki` a concise, testable as-built Feature Definitions corpus that lets maintainers understand its public CLI contract without reconstructing it from source and tests.

## Context

The current corpus covers only `ki repo audit`, while the public CLI also covers acquisition, bootstrap, harnesses, skills, repository operations, management, Agoras, and trades. The existing test suite provides concrete verification hooks for this re-engineering pass.

## Boundary

This work documents current observable behaviour only. It does not add CLI behaviour, rewrite tests, or change portable Feature Definitions semantics.

## Shaping

Retain the existing `REPO-AUDIT` identifiers and add small, flat areas that follow the public command boundaries. Keep each requirement behaviour-level, cite an existing CLI test as its verification hook, and place unbuilt behaviour in `Gaps`. Submit the resulting Guides-skill learning to the Harness as a knowledge trade; the Harness retains all decisions on changing its skill.

## Current state

The corpus already defines twelve areas for acquisition, Agoras, bootstrap, the root CLI, development, harnesses, management, registry, repository audit and operations, skills, and trades. The current CLI also has distinct command and contract-test modules for each public family, so the remaining work is a coverage and boundary review rather than source implementation.

## Steps

- [ ] Compare each public command path and its contract-test seam with the existing Feature Definitions index; identify missing areas, misplaced requirements, and unbuilt behaviour that belongs in `Gaps`.
- [ ] Update the index and affected area files with concise RFC-2119 requirements that describe only current observable behaviour and cite the exact in-process CLI test that verifies each behaviour.
- [ ] Add a compact Feature Definitions area for every materially distinct public family that lacks one, without duplicating a neighbouring command group's contract.
- [ ] Verify the complete corpus against the registered feature-definition governance and capture the reusable Guides-routing learning as a Harness knowledge trade.

## Files touched

- `docs/features/index.md` and the affected Feature Definition area files.
- New flat `docs/features/<area>.md` files only where a distinct public command family has no current area.
- `docs/roadmap/KI-TOOL-CLI-019-reengineer-feature-definitions.md`.
- One outbound knowledge-trade record only after the local corpus is verified.

## Verify

- `ki repo audit --skill ki-feature-definitions --repo .`.
- The existing named contract tests for every requirement cited by an updated or new area.
- `bun run test:coverage` and `bunx tsc --noEmit`.
- A review confirms each public command family is covered once, requirements state as-built behaviour, and unbuilt work appears only in `Gaps`.

## Dependencies / blocks

This is independently executable documentation work. It must not invent CLI behaviour or alter the Feature Definitions standard; any reusable guidance learning is submitted to the Harness only after local verification.

## Discussion

### Corpus boundary

Coverage means every public command group has an intelligible as-built contract, not that every command option receives a requirement. The corpus should identify durable behaviour and its verification seam while leaving procedural material to guides and implementation detail to source and tests.
