---
id: KI-TOOL-CLI-097
area: CLI
title: Separate trade evidence
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-30T09:46:47Z
updated_at: 2026-09-30T09:46:47Z
---

# KI-TOOL-CLI-097: Separate trade evidence

## Goal

Core roadmap inventory clearly distinguishes trades not requested from an observed empty trade inventory.

## Context

`listRoadmap` skips trade lookup for count-only summary but still returns `trades: []`; its result type makes skipped, zero, and unavailable evidence easy to confuse. The summary renderer currently ignores the field, so this is a maintainability and future-correctness seam.

## Boundary

Keep the public summary count-only, preserve `list` trade reporting, and do not alter trade discovery or JSON schema.

## Current state

`src/core/work/operations.ts` uses `includeTrades: false` to construct an empty estate and projects `trades: []` for every result.

## Steps

- [ ] Represent unrequested trade evidence distinctly in the core result type and implementation.
- [ ] Ensure roadmap `list` explicitly requests trade evidence and summary consumes only item inventory.
- [ ] Add core/public CLI assertions for skipped, empty, and unavailable evidence.

## Files touched

Core work operations and types, roadmap command, and focused work/CLI tests.

## Verify

Focused roadmap tests, type check, Biome, and full coverage gate pass.

## Dependencies / blocks

None; this is independent of trade-record transport changes.

## Documentation impact

### Decision Records

No new decision; existing roadmap/trade boundary is made explicit in types.

### Specifications

No behavior change; existing count-only and list contracts remain.

### Guides

No user-facing command change.

### Roadmap

Record delivery here; no known follow-on.

## Discussion

### Evidence states

Skipped is not the same as a successful empty trade lookup; tests should make the distinction observable at the core seam.
