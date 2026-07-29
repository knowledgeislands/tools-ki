---
id: KI-TOOL-VENDOR-001
title: Define cross-repository skill vendor provenance
theme: cross-repository-vendoring
horizon: future
status: open
candidate: true
blocks: []
blocked-by: []
baseline-ref: null
transferred-from: knowledgeislands/ki-agentic-harness:foundation-tooling
---

## Context

Define how one KI harness can declare and receive a shared module from another harness without relying on a nearby checkout or ambient filesystem path.

## Boundary

Do not weaken the rule that only a provider in the same physical harness checkout may be symlinked; an external provider requires an explicit portable vendor or installation contract.

## Discussion

### Provenance contract

An external shared module needs a stable provider identity, immutable version or digest evidence, declared capability surface, and a reproducible acquisition path. A nearby checkout, ambient path, or unpinned branch is not provenance.

### Compatibility and isolation

The receiving harness must validate the imported module's declared contract before exposing it, retain its own runtime-selection rules, and surface conflicts or incompatible versions as diagnostics. Vendoring must not grant the provider access to the receiver's filesystem or runtime state beyond the explicit artifact boundary.

### Shaping condition

Use the transferred foundation-tooling context to define the first portable artifact and validation path only when a shared module has a concrete provider and consumer. Until then, preserve this item as the authority and safety brief rather than a speculative installer design.
