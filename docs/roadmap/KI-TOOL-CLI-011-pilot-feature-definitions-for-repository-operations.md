---
id: KI-TOOL-CLI-011
title: Pilot Feature Definitions for repository operations
theme: cli
horizon: next
status: acceptance
blocks: []
blocked-by: []
baseline-ref: e429d984bb6330faf7876d1b8e86c27b3971c1f5
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

`src/commands/repo.ts`, `src/core/repository-operations.ts`, and focused `src/tests/cli/repo*.test.ts` suites provide an existing as-built, testable surface for `ki repo audit`.

`tools-ki` does not yet select `ki-feature-definitions` or contain a `docs/features/` corpus.

The pilot area is `ki repo audit` only, with the stable `REPO-AUDIT` prefix. It covers selected repository and skill resolution, audit verdict and finding reporting, output controls, and multi-repository summaries. `ki repo conform`, repository registration, initialization, and generic rubric-validation mechanics remain outside this pilot.

## Steps

- [x] Map the as-built `ki repo audit` contract from `src/core/repository-operations.ts` to the focused CLI coverage, selecting only independently verifiable observable behaviours for the pilot.
- [x] Declare `ki-feature-definitions` in `.ki-config.toml`, create `docs/features/index.md`, and register `repository-audit.md` with the `REPO-AUDIT` prefix.
- [x] Author `docs/features/repository-audit.md` with numbered, as-built requirements and concrete `_Verify:_` hooks for repository and skill selection, audit verdict and finding reporting, output controls, and multi-repository summaries; place only unbuilt candidate behaviour in `## Gaps`.
- [x] Run the Feature Definitions audit and the focused audit CLI test suites before the full test suite.
- [x] During acceptance review, have the repository owner use the corpus to answer: “When changing multi-repository audit failure reporting, which observable contract and focused CLI tests must change together?”
- [x] Record whether the corpus made that answer materially faster or clearer, including limitations, in this item's `Discussion`, then hand the durable evidence back to `knowledgeislands/ki-agentic-harness` item `KI-HARNESS-GOV-002` without proposing fleet rollout.

## Files touched

- `.ki-config.toml`
- `docs/features/index.md`
- `docs/features/repository-audit.md`
- This work item

## Verify

- `ki repo audit --skill ki-feature-definitions --repo .`
- Focused `src/tests/cli/repo.test.ts`, `src/tests/cli/repo-targets.test.ts`, and `src/tests/cli/repo-rendering.test.ts` coverage for every numbered requirement
- `bun run test`
- An owner review answers one named maintenance question using the corpus and records whether it was materially clearer or faster than the prior source-and-test-only route.

## Dependencies / blocks

No implementation dependency blocks planning. This item cannot become Ready until the pilot area's scope, prefix, named maintenance question, and owner review window are explicit.

## Acceptance

### Delivered

The repository now declares `ki-feature-definitions` and contains the `REPO-AUDIT` Feature Definitions area for the bounded `ki repo audit` pilot.

### Summary of changes

`docs/features/index.md` registers the corpus and `docs/features/repository-audit.md` records seven as-built, independently verifiable requirements for repository and capability selection, reporting, output controls, failure status, and multi-repository summaries.

### Verification

`ki repo audit --skill ki-feature-definitions --repo .` and `ki repo audit --skill ki-roadmap --repo .` both passed. The focused repository-audit CLI suites and `bun run test` passed, with 458 tests passing in 34 files.

### Outstanding concerns

This qualitative pilot does not measure elapsed maintenance time, and it intentionally excludes `ki repo conform`, registration, initialization, and target-resolution edge cases. The outgoing handoff asks the harness to assess the result; it does not propose fleet rollout.

### Mini recap

The immutable baseline is `e429d984bb6330faf7876d1b8e86c27b3971c1f5`; the delivered corpus is committed in `c056c9b`. The owner approved acceptance after reviewing the named maintenance question.

## Discussion

### Pilot boundary

`ki repo audit` is the smallest coherent pilot because it has externally visible success and failure reporting, focused CLI coverage, and one clear multi-repository boundary. `ki repo conform` shares supporting infrastructure but has a different mutation and transaction contract, so including it would make the first corpus too broad to evaluate clearly.

### As-built contract

The feature corpus describes current observable behaviour. A behaviour that needs a code change remains in `## Gaps` or a roadmap item; it must not receive a numbered normative requirement merely because the pilot would benefit from it. Each requirement must be independently verifiable from the named CLI tests, rather than restating an implementation detail from the command's supporting code.

### Pilot evaluation

The owner found the corpus materially clearer and faster for the named maintenance question. A multi-repository audit failure-reporting change maps directly to `REPO-AUDIT-006` and `REPO-AUDIT-007`, with their named `src/tests/cli/repo.test.ts` and `src/tests/cli/repo-targets.test.ts` verification hooks. The assessment is qualitative rather than timed, and target-resolution edge cases remain outside the pilot boundary.

### Origin and receiving ownership

Origin: `knowledgeislands/ki-agentic-harness` — `KI-HARNESS-GOV-002`.

The outgoing [evidence handoff](../../../-/_HANDOFFS/ki-agentic-harness/KI-TOOL-CLI-011-feature-definitions-pilot.md) asks the origin to assess the result. Any later fleet decision remains with the harness item and requires its own evidence-backed review.
