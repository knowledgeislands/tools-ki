---
id: KI-TOOL-VENDOR-001
title: Define skill provenance
theme: cross-repository-vendoring
horizon: future
status: draft
candidate: true
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
