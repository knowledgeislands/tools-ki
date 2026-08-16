---
id: KI-TOOL-CLI-046
title: Adopt audit host contract
area: CLI
theme: cli
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
transferred_from: knowledgeislands/ki-agentic-harness:KI-HARNESS-GOV-009
---

## Goal

Implement the receiver-owned native host contract required to remediate compatible repository-skill rubric findings safely.

## Context

`TRD-65db6d36` from `knowledgeislands/ki-agentic-harness` identifies a runtime-specific gap: the Harness can define the remediation contract but cannot prove `ki`'s activation, presentation, or loader behaviour. The incoming work is adopted here; its sender projection remains in `+/_TRADES/knowledgeislands/ki-agentic-harness/TRD-65db6d36.md`.

## Boundary

Do not invoke `ki` as a subprocess or write directly into a Harness checkout. Resolve providers only through declared, verified Harnesses; preserve configuration bytes and user settings; and do not claim atomicity for partial publication.

## Current state

`ki` receives and records trade decisions but does not yet expose the repository-skill inspection, proposal, preflight, and publication capability required by the remediation contract.

## Steps

- [ ] Define the native host seam for repository-skill inspection and proposed remediation.
- [ ] Fail closed for ambiguous, incompatible, unavailable, untrusted, unsafe, altered, and zero-compatible-agent states.
- [ ] Plan and dry-run an exact runtime-derived group, then publish only after complete preflight.
- [ ] Re-audit after publication and report `FIXED` only from the resulting evidence.

## Files touched

Expected implementation scope includes the native operation host, rubric session loading, remediation reporting, and CLI sandbox tests.

## Verify

- CLI sandbox tests cover the success path and every blocked preflight state.
- `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check`, and `ki repo audit --repo .` pass.

## Dependencies / blocks

No local work-item dependencies.

## Documentation impact

### Decision Records

No decision record is needed until planning identifies a material architecture decision.

### Specifications

Update the trade or native-operation specification only if the final behaviour changes an existing public contract.

### Guides

No guide impact is expected before the implementation is planned.

### Roadmap

This record is the receiver-owned adoption of `TRD-65db6d36`.

## Discussion

The sender's unsubmitted review preparation is related evidence, not a dependency: this adopted work remains independently planable and must retain its own receiver-side priority and acceptance decisions.
