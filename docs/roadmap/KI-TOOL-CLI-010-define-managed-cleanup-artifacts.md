---
id: KI-TOOL-CLI-010
title: Define managed cleanup artifacts
theme: cli
horizon: future
status: open
candidate: true
blocks: []
blocked-by: []
baseline-ref: null
---

## Context

Define a persisted, versioned KI-owned stale-artifact format so a future `ki cleanup` can safely identify, report, and remove only state it owns. The design must establish creation ownership, staleness evidence, concurrency protection, recovery behaviour, and deterministic reporting before any deletion behaviour is introduced.

## Boundary

This item does not change V1's non-mutating cleanup report, infer ownership from cache or transaction-looking paths, delete unconfigured harnesses or links, or introduce broad filesystem cleanup.

## Discussion

### Ownership record

Any candidate artifact format must identify its creating KI operation, version, exact owned paths, and lifecycle state. Cleanup may rely only on that persisted record, never on a filename pattern, cache location, or resemblance to a transaction directory.

### Staleness and recovery evidence

The design must define positive staleness evidence, concurrent-operation exclusion, interruption recovery, and deterministic dry-run reporting before it can authorise a deletion. A missing or malformed ownership record is a refusal condition, not an invitation to infer intent.

### Promotion condition

Shape this item when a KI operation first needs to persist a versioned, recoverable managed artifact. Until then, V1's explicit no-op cleanup result remains the correct safety boundary.
