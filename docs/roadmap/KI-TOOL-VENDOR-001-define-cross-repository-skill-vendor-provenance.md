---
id: KI-TOOL-VENDOR-001
title: Define cross-repository skill provenance
area: VENDOR
theme: cross-repository-vendoring
horizon: next
status: draft
blocks: []
blocked_by: [KI-TOOL-CLI-050]
baseline_ref: null
transferred_from: knowledgeislands/ki-agentic-harness:foundation-tooling
---

## Goal

Allow a repository to use skills from another compatible Harness with explicit, reproducible provenance and a safe local-development override.

## Context

`humansnotrobots/hnr-agentic-harness` is now a concrete external provider with the `hnr-backend-conventions` and `hnr-frontend-conventions` capabilities. `tools-ki` discovers that Harness locally, while the HNR Harness correctly declares `knowledgeislands/ki-agentic-harness` as its governance dependency. The canonical Knowledge Islands Harness does not and must never depend on HNR.

HNR release `v0.1.1` identifies commit `792dd375ca4440acecae13d28e441773fccb7af5`, but publishes no immutable asset, digest, signature, or capability manifest. The current `ki dev local` surface overrides only the canonical Harness, so external Harness development still depends on whichever installed payload happens to be present.

## Boundary

This work defines compatible-Harness publication, acquisition, provenance, and named local-development sources. Production resolution remains pinned to immutable provider evidence. A development override is explicit, local, mutable, and never presented as production provenance.

The dependency is one-way: HNR may depend on the canonical Knowledge Islands Harness for governance, but the canonical Harness remains independent of every external provider. This is a Harness relationship, not an npm development dependency and not ambient checkout discovery.

## Current state

- `tools-ki` has delivered declared multi-Harness selection through `[repo].harnesses`.
- The local Harness inventory resolves HNR as a compatible provider with two capabilities.
- The HNR repository already selects the canonical Knowledge Islands Harness in `.ki-config.toml`.
- HNR has a tagged GitHub release but no published immutable payload or provenance metadata.
- `ki dev local` can switch only the canonical Harness and cannot target HNR independently.

## Steps

- [x] Name `humansnotrobots/hnr-agentic-harness` as the provider, `tools-ki` as the reference consumer, and the canonical-Harness-to-HNR dependency direction.
- [ ] Specify the provider identity, immutable artifact digest, release evidence, capability manifest, supported runtimes, and acquisition fields.
- [ ] Generalise the development-source contract so `ki dev local` can set, enable, inspect, and disable a local checkout for one named compatible Harness without changing production provenance.
- [ ] Define the HNR-owned publication slice: immutable archive, digest, capability manifest, release evidence, and compatibility with its canonical Harness dependency.
- [ ] Record acquired provider evidence in receiver-owned state and resolve declared skills only from verified installed payloads or an explicit active development source.
- [ ] Define conflict, offline, incompatible-runtime, missing-artifact, failed-upgrade, and rollback behaviour while retaining the last verified installed version.
- [ ] Cover the public pathways through CLI `sandbox()` tests, including named development activation and deterministic failure diagnostics.
- [ ] Align the behaviour specification, architecture decision, contributor guide, and help text with the delivered contract.

## Files touched

Expected local surfaces include `src/commands/dev/`, `src/core/harness/`, Harness acquisition and storage modules, CLI sandbox tests, and the corresponding decisions, guides, specifications, and help text. Provider-owned HNR publication changes remain in the HNR repository and require their own bounded commit.

## Verify

- `bun run test`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bunx biome check`
- `bunx knip`
- `ki repo audit --repo .`
- A receiver acquires and resolves both HNR capabilities from immutable evidence.
- A named HNR local-development source takes effect only while explicitly enabled and restores the verified installed payload when disabled.

## Dependencies / blocks

None. Contract design, named development-source support, receiver storage, and CLI verification can proceed locally. The final production proof includes the HNR-owned publication slice rather than treating its absence as a reason to defer the whole item.

## Documentation impact

### Decision Records

Record the one-way Harness dependency, immutable production provenance, and explicit mutable development-source boundary.

### Specifications

Define compatible-Harness publication, acquisition, named development overrides, resolution, diagnostics, and rollback behaviour.

### Guides

Document how provider authors publish evidence and how contributors enable or disable a named local Harness checkout safely.

### Roadmap

This record moves from Waiting for a concrete provider into Next now that HNR supplies the provider and capability surface.

## Discussion

### Dependency direction

The HNR Harness depends on the canonical Knowledge Islands Harness for portable governance. The canonical Harness is the root contract and never gains a dependency on HNR or another compatible Harness.

### Development override

The current canonical-only `ki dev local` model should become a named Harness development-source model. A local HNR checkout may replace its verified installed payload during explicit development, without requiring a particular installed HNR version and without becoming provenance evidence.

### Production provenance

Production use still requires stable provider identity, immutable version and digest evidence, a declared capability surface, a reproducible acquisition path, and receiver-owned installation state. A nearby checkout, mutable branch, or unpinned archive is insufficient.

### Provider publication

HNR `v0.1.1` proves that a real provider and release lifecycle exist, but its current source archive is not the completed publication contract. The executable slice must add a provider-authored immutable payload and evidence before claiming end-to-end production provenance.
