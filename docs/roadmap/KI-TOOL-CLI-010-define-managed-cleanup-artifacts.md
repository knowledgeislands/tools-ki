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
