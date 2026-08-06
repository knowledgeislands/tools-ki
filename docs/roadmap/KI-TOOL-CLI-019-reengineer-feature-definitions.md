---
id: KI-TOOL-CLI-019
title: Re-engineer feature definitions
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked-by: []
baseline-ref: a002a6c85a5607c0901d7d2da4323c99e949b064
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

- [x] Add as-built Agora requirements for profile membership and opening behaviour.
- [x] Add as-built management requirements for direct diagnostics, safe projection repair, and read-only cleanup and documentation lookup.
- [x] Add an as-built repository-roadmap requirement for inventory and guarded lifecycle maintenance.
- [x] Submit a knowledge trade that proposes a public-contract coverage review in the Feature Definitions standard without requiring one requirement per command.
- [x] Verify the complete corpus and its cited CLI contracts.

## Files touched

- `docs/features/agoras.md`, `docs/features/management.md`, and `docs/features/repository-operations.md`.
- `docs/roadmap/KI-TOOL-CLI-019-reengineer-feature-definitions.md`.
- One outbound Feature Definitions knowledge-trade record.

## Verify

- `ki repo audit --skill ki-feature-definitions --repo .`.
- `bunx vitest run src/tests/cli/agora/agora.test.ts src/tests/cli/manage/diag.test.ts src/tests/cli/manage/local-commands.test.ts src/tests/cli/manage/repair.test.ts src/tests/cli/repo/roadmap.test.ts`.
- `bunx tsc --noEmit`.
- A review confirms every public contract surface has a requirement, Gap, or explicit area-level exclusion rather than implying one requirement per command.

## Dependencies / blocks

This is independently executable documentation work. It must not invent CLI behaviour or alter the Feature Definitions standard; the Harness retains authority over the submitted standard improvement.

## Review

### Delivered

Added as-built requirements for Agora profile membership and opening, management diagnostics, repair, cleanup, and documentation lookup, and repository-roadmap inventory and guarded maintenance. Submitted [TRD-094f7987](../../-/_TRADES/knowledgeislands/ki-agentic-harness/TRD-094f7987.md) to propose a bounded public-contract coverage review for the shared Feature Definitions standard.

### Summary of changes

The corpus now records the previously unrepresented tested public surfaces without requiring a one-to-one command-to-requirement mapping. Each requirement remains behaviour-level and cites its existing CLI-contract evidence.

### Verification

- Baseline: `a002a6c85a5607c0901d7d2da4323c99e949b064`.
- Delivery: `43b63546dc0e2a1818d9d3f1fb7b1a648fb0e587`.
- Passed: `bunx vitest run src/tests/cli/agora/agora.test.ts src/tests/cli/manage/diag.test.ts src/tests/cli/manage/local-commands.test.ts src/tests/cli/manage/repair.test.ts src/tests/cli/repo/roadmap.test.ts` (53 tests), `bunx tsc --noEmit`, `ki repo audit --skill ki-feature-definitions --repo .`, and `ki repo audit --skill ki-authoring --repo .`.

### Outstanding concerns

The Harness alone decides whether and how to tighten the shared Feature Definitions standard. Its response to the submitted knowledge trade is not a blocker to this completed local documentation work.

### Post-change review

The corpus still treats requirements as bounded behavioural contracts. The proposed coverage review makes omissions visible through human judgment against a product's public contract inventory, without manufacturing a mechanical claim of completeness or flattening every command into a separate requirement.

### Mini recap

CLI-019 closes the gap between the current public CLI and its as-built documentation, and records the reusable standard learning at the Harness boundary.

## Discussion

### Corpus boundary

Coverage means every public command group has an intelligible as-built contract, not that every command option receives a requirement. The corpus should identify durable behaviour and its verification seam while leaving procedural material to guides and implementation detail to source and tests.
