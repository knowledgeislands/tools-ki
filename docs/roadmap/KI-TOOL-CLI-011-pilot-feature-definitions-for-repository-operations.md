---
id: KI-TOOL-CLI-011
title: Pilot Feature Definitions for repository operations
theme: cli
horizon: next
status: open
blocks: []
blocked-by: []
baseline-ref: null
transferred-from: knowledgeislands/ki-agentic-harness:GOV-002
---

## Goal

Prove whether a small, as-built Feature Definitions corpus makes KI repository operations easier to maintain and verify.

## Context

The harness's GOV-002 work item has selected `tools-ki` as the pilot because its repository-operation commands have visible CLI behaviour, focused test coverage, and a bounded command surface.

This repository accepts the pilot as its own work. The harness supplies the originating context but does not choose this item's priority, implementation, or success conclusion.

## Boundary

Document one bounded repository-operation area only. Do not claim the whole CLI is specified, turn planned behaviour into numbered requirements, change CLI behaviour to fit a definition, or treat the pilot as a fleet-wide adoption decision.

## Current state

`src/commands/repo.ts`, `src/core/repository-operations.ts`, and the focused `src/tests/cli/repo*.test.ts` suites provide an existing as-built, testable surface for `ki repo audit` and `ki repo conform`.

`tools-ki` does not yet select `ki-feature-definitions` or contain a `docs/features/` corpus. The first corpus must be authored from existing CLI behaviour and verification, not from the desired future design.

## Steps

- [ ] Review the existing repository-operation command and focused CLI tests to select the smallest coherent as-built behaviour set for the pilot area.
- [ ] Declare `ki-feature-definitions` in `.ki-config.toml`, create `docs/features/index.md`, and register a flat repository-operation area with a stable prefix.
- [ ] Author numbered requirements only for behaviour already proven by focused CLI tests, including a concrete `_Verify:_` hook for every requirement; place unbuilt or uncertain behaviour in `## Gaps`.
- [ ] Run the Feature Definitions audit and the focused repository-operation CLI tests, then have the repository owner assess one named maintenance question using the new corpus.
- [ ] Record whether the corpus made that question materially faster or clearer, including any limitation, and hand the durable evidence back to `KI-HARNESS-GOV-002` without proposing fleet rollout directly.

## Files touched

- `.ki-config.toml`
- `docs/features/index.md`
- `docs/features/repository-operations.md`
- This work item

## Verify

- `ki repo audit --skill ki-feature-definitions --repo .`
- Focused `src/tests/cli/repo*.test.ts` coverage for every numbered repository-operation requirement
- `bun run test`
- An owner review answers one named maintenance question using the corpus and records whether it was materially clearer or faster than the prior source-and-test-only route.

## Dependencies / blocks

No implementation dependency blocks planning. This item cannot become Ready until the pilot area's scope, prefix, named maintenance question, and owner review window are explicit.

## Discussion

### Pilot boundary

Repository operations are a useful pilot because they already offer externally visible commands, clear success and failure reporting, and focused CLI tests. A single area keeps the corpus small enough to judge whether the Feature Definitions format adds value beyond those tests.

### As-built contract

The feature corpus describes current observable behaviour. A behaviour that needs a code change remains in `## Gaps` or a roadmap item; it must not receive a numbered normative requirement merely because the pilot would benefit from it.

### Origin and receiving ownership

Origin: `knowledgeislands/ki-agentic-harness` — `KI-HARNESS-GOV-002`.

This local record is the acceptance boundary for the pilot. Any later fleet decision remains with the harness item and requires its own evidence-backed review.
