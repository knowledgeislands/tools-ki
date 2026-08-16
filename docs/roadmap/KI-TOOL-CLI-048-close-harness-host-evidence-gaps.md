---
id: KI-TOOL-CLI-048
title: Close Harness evidence gaps
area: CLI
theme: cli
horizon: next
status: in-progress
blocks: []
blocked_by: []
baseline_ref: f86666e9eaef4a89da38e235216f47c1f68fe1f7
transferred_from: knowledgeislands/ki-agentic-harness:KI-HARNESS-REV-001
---

## Goal

Make the native host's Harness-derived evidence explicit, fail-closed, and trustworthy across activation, local development, and trade observation.

## Context

Trade `TRD-4a875479` identifies gaps where the CLI is the receiver-owned host: activation-link integrity, declared-capability resolution, verified provenance, development selection, and completion observation.

## Boundary

Change only `tools-ki` host behaviour, its CLI contract tests, and the repository-operation specification. Do not alter Harness skills or write to a sibling repository.

## Current state

The host resolves compatible skills for runtime activation, but its evidence contract does not yet state or test every integrity and provenance condition called out by the trade.

## Steps

- [x] Map each adopted trade concern to its current host boundary and record the exact receiver-owned behaviour, including the intentionally unsupported cases.
- [x] Strengthen activation-link and declared-capability validation so invalid, stale, or unverifiable evidence fails closed before a rubric can act on it.
- [x] Define deterministic local-development selection and verified Harness provenance without widening a rubric's filesystem or subprocess capabilities.
- [x] Make conform publication and post-publication observation report only evidence the host can prove, including partial-publication and receipt-batch boundaries.
- [x] Cover the public CLI contract through `sandbox()` for valid activation, each blocked state, local development, provenance, and completion observation.

## Files touched

- `src/core/` — host evidence, resolution, and runtime activation boundaries.
- `src/commands/repo/` — audit and conform orchestration and reporting.
- `src/tests/cli/` — end-to-end CLI contract coverage through `sandbox()`.
- `docs/specs/repository-operations.md` — host evidence and publication contract.

## Verify

- `bun run test`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bunx biome check`
- `ki repo audit --repo .`

## Dependencies / blocks

No local work-item dependencies. This follows `KI-TOOL-CLI-046` but does not block it.

## Documentation impact

### Decision Records

No decision record is expected unless planning identifies a new durable architectural choice.

### Specifications

Update `docs/specs/repository-operations.md` with the final fail-closed evidence and publication contract.

### Guides

Update an operator-facing guide only if the user-visible audit or conform workflow changes.

### Roadmap

This is the receiver-owned adoption of `TRD-4a875479` from KI Agentic Harness.

## Discussion

The activation host is the only rubric-facing boundary: a rubric receives immutable states and can propose only missing declared names. Harness discovery supplies resolved capability provenance, including the active validated local-development projection; the host does not accept a rubric-provided source path, filesystem handle, or command. Conform observes activation only by re-auditing the same selected skills after publication; partial direct publication remains governed by the existing independent-group boundary.
