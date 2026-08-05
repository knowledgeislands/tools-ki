---
id: KI-TOOL-CLI-010
title: Define managed cleanup artifacts
theme: cli
horizon: future
status: draft
candidate: true
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Define a safe, recoverable ownership record for KI-managed artifacts so future cleanup can identify only state KI created.

## Context

Define a persisted, versioned KI-owned stale-artifact format so a future `ki cleanup` can safely identify, report, and remove only state it owns. The design must establish creation ownership, staleness evidence, concurrency protection, recovery behaviour, and deterministic reporting before any deletion behaviour is introduced.

## Boundary

This item does not change V1's non-mutating cleanup report, infer ownership from cache or transaction-looking paths, delete unconfigured harnesses or links, or introduce broad filesystem cleanup.

## Discussion

### Ownership record

Any candidate artifact format must identify its creating KI operation, version, exact owned paths, and lifecycle state. Cleanup may rely only on that persisted record, never on a filename pattern, cache location, or resemblance to a transaction directory.

The first design must also establish where the record lives, whether it is written atomically with its artifact, and how a later KI release establishes backwards-compatible reader behaviour without treating an unknown record as deletable state.

### Staleness and recovery evidence

The design must define positive staleness evidence, concurrent-operation exclusion, interruption recovery, and deterministic dry-run reporting before it can authorise a deletion. A missing or malformed ownership record is a refusal condition, not an invitation to infer intent.

Evidence should distinguish a completed artifact eligible for cleanup from an operation that is still live, interrupted but recoverable, manually altered, or outside KI ownership. A cleanup report needs to name each refusal reason so an operator can make a deliberate recovery decision rather than retrying blind.

### Candidate first deliverable

The first executable outcome is a versioned manifest and a read-only `ki cleanup` report over one concrete KI-created artifact family. It must prove containment before any delete verb is proposed, and its test fixture must cover interrupted writes, lock contention, foreign files, symlinks, malformed manifests, and a repeatable dry run.

### Promotion condition

Promote this item when a KI operation first needs to persist a versioned, recoverable managed artifact and can name its producer, owned paths, lifetime, and recovery owner. Until then, V1's explicit no-op cleanup result remains the correct safety boundary.
