---
id: KI-TOOL-CLI-048
title: Close Harness host evidence gaps
area: CLI
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: f86666e9eaef4a89da38e235216f47c1f68fe1f7
transferred_from: knowledgeislands/ki-agentic-harness:KI-HARNESS-REV-001
---

## Goal

Make the native host's Harness-derived evidence explicit, fail-closed, and trustworthy across runtime activation, local development, and trade observation.

## Context

Trade `TRD-4a875479` identified receiver-owned evidence gaps in activation-link integrity, declared-capability resolution, verified provenance, development selection, and completion observation.

## Boundary

Change only `tools-ki` host behaviour, its CLI contract tests, and the repository-operation specification. Do not alter Harness skills or write to a sibling repository.

## Current state

The native host resolves compatible skills for runtime activation and must now prove the activation and evidence contract before a rubric is allowed to act.

## Steps

- [x] Map each adopted trade concern to its current host boundary and record the exact receiver-owned behaviour, including intentionally unsupported cases.
- [x] Strengthen activation-link and declared-capability validation so invalid, stale, or unverifiable evidence fails closed before a rubric can act on it.
- [x] Define deterministic local-development selection and verified Harness provenance without widening a rubric's filesystem or subprocess capabilities.
- [x] Make conform publication and post-publication observation report only evidence the host can prove, including partial-publication and receipt-batch boundaries.
- [x] Cover the public CLI contract through `sandbox()` for valid activation, each blocked state, local development, provenance, and completion observation.

## Check

- `bun run test`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bunx biome check`
- `ki repo audit --repo .`

## Dependencies

No local work item blocks this record. KI-TOOL-CLI-046 does not block it.

## Documentation impact

`docs/specs/repository-operations.md` records the fail-closed host activation contract. The linked Harness review and receiver-owned trade disposition remain documented by this record.

## Review

### Delivered

Added the receiver-owned activation contract in `REPO-OPS-008` and hardened repository conform so a requested runtime skill is activated and re-audited only through verified, declared host capabilities.

### Summary of changes

The host rejects unsafe regular activation, missing compatible runtimes, and undeclared requested skills. CLI contract coverage exercises successful activation and re-audit plus each fail-closed route through `sandbox()`.

### Verification

Targeted CLI activation coverage, TypeScript, Biome, and the roadmap audit passed during implementation. Full repository gates are rerun for this review packet before hand-off.

### Outstanding concerns

None. This change deliberately does not add caching, cross-invocation result reuse, or input-based rubric skipping.

### Post-change review

Activation remains a native host concern. The rubric load boundary is widened only by the explicit runtime capability contract, preserving the rubric's lack of filesystem and command capabilities.

### Mini recap

CLI-048 closes the receiver-owned host evidence gaps identified by the linked Harness review and is ready for owner review once the final gates complete.

## Discussion

Conform re-audits a skill only after staged activation work. It does not skip correctness gates based on inputs or prior invocation results.
