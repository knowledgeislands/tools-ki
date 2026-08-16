---
id: KI-TOOL-CLI-046
title: Adopt audit host contract
area: CLI
theme: cli
horizon: next
status: done
blocks: []
blocked_by: []
baseline_ref: 1a33b054986e8d55b343c4e4222be42de38ad914
transferred_from: knowledgeislands/ki-agentic-harness:KI-HARNESS-GOV-009
---

## Goal

Implement the receiver-owned native host contract required to remediate compatible repository-skill rubric findings safely.

## Context

`TRD-65db6d36` from `knowledgeislands/ki-agentic-harness` identifies a runtime-specific gap: the Harness can define the remediation contract but cannot prove `ki`'s activation, presentation, or loader behaviour. The incoming work is adopted here; its sender projection remains in `+/_TRADES/knowledgeislands/ki-agentic-harness/TRD-65db6d36.md`.

## Boundary

Do not invoke `ki` as a subprocess or write directly into a Harness checkout. Resolve providers only through declared, verified Harnesses; preserve configuration bytes and user settings; and do not claim atomicity for partial publication.

## Current state

`ki` validates and executes native rubric sessions but does not yet expose the repository-skill activation capability required by the remediation contract. The Harness contract defines `repositorySkills.inspect(names)` as host-resolved active, missing, or blocked evidence and `repositorySkills.propose(names)` as the only native mutation request.

## Steps

- [x] Extend the rubric context contract and runtime-loader validation with the optional `repositorySkills` capability, keeping malformed or unsupported declarations fail-closed.
- [x] Derive compatible repository-skill activation evidence from declared verified Harnesses through the existing host resolution path; distinguish active, missing, and blocked names without exposing filesystem or subprocess capability to a rubric.
- [x] Build a native proposal that preflights the complete exact runtime-derived group before changing any activation link, preserves configuration bytes and user settings, and becomes a no-op when already active.
- [x] Wire audit and conform orchestration so a rubric can inspect in audit, propose in conform, preview the exact group in dry-run, publish only after preflight, and re-audit before reporting `FIXED`.
- [x] Add CLI sandbox cases for valid activation, every blocked state, dry-run, partial-publication reporting, repeated conform, and re-audit evidence.

## Files touched

Expected implementation scope:

- `src/core/rubric.ts` and `src/core/runtime-loader.ts` for the portable session capability and validation.
- `src/core/runtime.ts`, repository-skill resolution helpers, and `src/commands/repo/index.ts` for host-owned evidence, proposal, publication, and rendering.
- `src/tests/cli/repo/conform-execution.test.ts` and adjacent CLI contract tests.
- `docs/specs/repository-operations.md` if the public conform behaviour gains a requirement.

## Verify

- CLI sandbox tests drive the public audit and conform commands through `sandbox()`, covering the success path and every blocked preflight state.
- `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check`, and `ki repo audit --repo .` pass.

## Dependencies / blocks

No local work-item dependencies. The sender's `TRD-65db6d36` is adopted and remains retained until its decision-observation release is visible.

## Documentation impact

### Decision Records

No decision record is needed until planning identifies a material architecture decision.

### Specifications

Update `docs/specs/repository-operations.md` with the conform capability and fail-closed publication contract.

### Guides

Add a guide only if the final command introduces an operator decision beyond existing `ki repo conform` usage.

### Roadmap

This record is the receiver-owned adoption of `TRD-65db6d36`.

## Review

### Delivered

Implemented the receiver-owned runtime-skill remediation host contract from baseline `1a33b054986e8d55b343c4e4222be42de38ad914`, resulting in `99a7fb35837989facfe24f3fc80d540fc06827ec`.

### Summary of changes

Rubric sessions receive a typed `repositorySkills` capability. The native host resolves declared verified skills, reports active, missing, or blocked link state, preflights proposed missing names, activates managed links, and re-audits.

### Verification

Passed `bun run test`, `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check`, and `ki repo audit --repo .`.

### Outstanding concerns

None.

### Post-change review

Rubrics only inspect and propose; the CLI owns resolution, preflight, publication, and re-audit. The item is ready for human acceptance.

### Mini recap

Delivered adopted trade `TRD-65db6d36` as `KI-TOOL-CLI-046`. Received `TRD-4a875479` remains unconsidered.

## Done

Accepted by the repository owner on 2026-08-16. The delivered runtime-skill remediation host contract remains retained as the closure record for adopted trade `TRD-65db6d36`.

## Discussion

The sender's unsubmitted review preparation is related evidence, not a dependency: this adopted work remains independently planable and must retain its own receiver-side priority and acceptance decisions.

### Delivery notes

### Delivered

Implemented the receiver-owned runtime-skill remediation host contract from baseline `1a33b054986e8d55b343c4e4222be42de38ad914`, resulting in `99a7fb35837989facfe24f3fc80d540fc06827ec`.

### Summary of changes

Rubric sessions receive a typed `repositorySkills` capability. The native host resolves declared verified skills, reports active, missing, or blocked link state, preflights proposed missing names, activates managed links, and re-audits. CLI sandbox coverage exercises dry-run, successful activation, re-audit, and repeated no-op behaviour.

### Verification

Passed `bun run test`, `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check`, and `ki repo audit --repo .`. The standing `TOOL-RELEASE-MARKERS` warning remains intentional under `AGENTS.md`.

### Outstanding concerns

None. A blocked or partially published runtime-link group fails closed and is re-audited when linking has begun.

### Post-change review

Rubrics only inspect and propose; the CLI owns resolution, preflight, publication, and re-audit. The item is ready for human review, not self-acceptance.

### Mini recap

Delivered adopted trade `TRD-65db6d36` as `KI-TOOL-CLI-046`. Received `TRD-4a875479` remains unconsidered for receiver-owned prioritisation.
