---
id: KI-TOOL-VENDOR-001
title: Define skill provenance
theme: cross-repository-vendoring
horizon: now
status: draft
blocks: []
blocked-by: []
baseline-ref: null
transferred-from: knowledgeislands/ki-agentic-harness:foundation-tooling
---

## Goal

Define a portable, verifiable provenance contract for sharing a module between KI harnesses.

## Context

Define how one KI harness can declare and receive a shared module from another harness without relying on a nearby checkout or ambient filesystem path.

## Boundary

Do not weaken the rule that only a provider in the same physical harness checkout may be symlinked; an external provider requires an explicit portable vendor or installation contract.

## Current state

Nothing implements cross-harness vendoring today. `ki` installs skills from a single acquired harness and links a provider only within the same physical harness checkout; there is no notion of an external provider, no place to record its identity or version evidence, and no acquisition path that does not depend on a nearby checkout. `KI-TOOL-CLI-025` introduced the first structure this contract can attach to — a declared `[repo] harnesses` list in `.ki-config.toml` — and has been delivered, accepted, and pruned.

## Steps

- [x] Wait for the declared harness list to settle. `KI-TOOL-CLI-025` delivered it: `[repo] harnesses` is an array of `<owner>/<name>` identifiers, and a bare skill name binds to exactly one of them.
- [ ] Decide what a provenance entry adds to that list: provider identity, immutable version or digest evidence, declared capability surface, and acquisition path.
- [ ] Choose the publication form the first provider supports — archive, registry entry, or signed release — and specify how the receiver records immutable evidence of what it acquired.
- [ ] Specify validation of an imported module's declared contract before exposure, the conflict policy for two providers offering the same capability, and the upgrade and removal story that preserves a working installed version on failure.
- [ ] Specify the diagnostics for an offline or unavailable provider, an incompatible version, and a capability conflict, so none of them falls back to a local checkout.
- [ ] Prove one provider-to-one receiver artifact path end to end before generalising.

## Files touched

Not yet determined. The contract is the deliverable at this stage; the implementation surface follows from the publication form chosen, and would centre on harness acquisition and skill resolution.

## Verify

The contract is verified when a single provider-to-receiver path runs end to end: publication evidence produced, acquisition verified against it, installation beneath a receiver-owned location, capability validation before exposure, and deterministic diagnostics for the offline, incompatible, and conflicting cases. Until that path exists, this item is verified by review of the written contract rather than by a command.

## Dependencies / blocks

Previously blocked by `KI-TOOL-CLI-025`, which introduced the `[repo] harnesses` list. That item was delivered, accepted, and pruned on 2026-08-09, so nothing now blocks this one.

That list is the anchor for a provenance contract: it is where a repository names the harnesses it draws skills from, so it is where a provider's identity, version or digest evidence, and acquisition path would be recorded. Designing provenance before the declaration it must attach to would have designed it against a shape that was about to change — which is why the block was held rather than worked around. Resolution now binds a bare skill name against that declared list rather than against whichever harnesses happen to be installed, so a provenance entry has a stable, version-controlled subject to attach to.

## Discussion

### Provenance contract

An external shared module needs a stable provider identity, immutable version or digest evidence, declared capability surface, and a reproducible acquisition path. A nearby checkout, ambient path, or unpinned branch is not provenance.

The future contract must state whether the provider publishes an archive, a registry entry, or a signed release; how the receiver records immutable evidence; and which canonical metadata describes the module's exported skills, dependencies, and supported runtimes. It must make an offline or unavailable provider a clear diagnostic rather than falling back to a local checkout.

### Compatibility and isolation

The receiving harness must validate the imported module's declared contract before exposing it, retain its own runtime-selection rules, and surface conflicts or incompatible versions as diagnostics. Vendoring must not grant the provider access to the receiver's filesystem or runtime state beyond the explicit artifact boundary.

The first design also needs a conflict policy for two providers offering the same capability, a removal and upgrade story that preserves a working installed version on failure, and a clear distinction between copied vendor payloads and developer-only local links.

### Candidate first deliverable

The first executable slice should prove one provider-to-one receiver artifact path end to end: publication evidence, verified acquisition, installation beneath a receiver-owned location, capability validation, and deterministic diagnostics. It should not attempt a general dependency solver, automatic cross-harness upgrades, or direct checkout linking.

### Shaping condition

Promote this item when a shared module has a concrete provider, consumer, and release or registry surface that can supply immutable evidence. Until then, preserve this item as the authority and safety brief rather than a speculative installer design.
