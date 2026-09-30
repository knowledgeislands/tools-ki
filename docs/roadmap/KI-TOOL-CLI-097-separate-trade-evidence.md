---
id: KI-TOOL-CLI-097
area: CLI
title: Separate trade evidence
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 9aec010b1ec726663f09ed459da7c28065d30dbb
created_at: 2026-09-30T09:46:47Z
updated_at: 2026-09-30T10:38:12Z
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

- [x] Represent unrequested trade evidence distinctly in the core result type and implementation.
- [x] Ensure roadmap `list` explicitly requests trade evidence and summary consumes only item inventory.
- [x] Add core/public CLI assertions for skipped, empty, and unavailable evidence.

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

## Review

### Delivered

The approved core seam is implemented from baseline `9aec010b1ec726663f09ed459da7c28065d30dbb`. Public roadmap output and JSON shapes remain unchanged.

### Change Summary

`src/core/work/operations.ts` now separates item-only inventory from trade-enriched listing in distinct result types. Summary and statistics use item-only inventory; detailed list still retrieves trades. Core and public CLI tests cover skipped, empty, and unavailable evidence.

### Verification

Focused core and roadmap tests, TypeScript, and Biome passed. `bun run test:coverage -- --reporter=dot` passed 940 tests with 100% statements, branches, functions, and lines.

### Outstanding concerns

Independent review and acceptance remain. No known implementation failure remains.

### Post-change review

The result type no longer mistakes an unrequested trade lookup for an observed empty estate. Existing list output is unchanged, so the item is ready for review.

### Mini recap

Roadmap item inventory and optional trade enrichment now have explicit boundaries. No further change is proposed from this slice.

## Discussion

### Evidence states

Skipped is not the same as a successful empty trade lookup; tests should make the distinction observable at the core seam.
