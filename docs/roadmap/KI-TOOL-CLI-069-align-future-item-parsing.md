---
id: KI-TOOL-CLI-069
area: CLI
title: Align future item parsing
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 04ea8dc51a2ffefa2e4e0f65a4b7139abbb5c3f0
created_at: 2026-09-14T19:04:19Z
updated_at: 2026-09-14T22:01:51Z
---

# Align future item parsing

## Goal

Make `ki repo roadmap list` interpret Future work using the same current roadmap contract enforced by compatible harnesses, without requiring the retired `candidate` field.

## Context

The `ki 0.3.6` roadmap reader requires `candidate: true` when `horizon: future`, while the current `ki-work-roadmap` standard requires `candidate` to be absent. A standards-compliant Infoschematics roadmap therefore passes the harness audit but produces six item diagnostics from `ki repo roadmap list`.

The disagreement makes a read-only native command report valid records as malformed and encourages a workaround that makes the canonical audit fail.

## Boundary

This item does not change horizon meanings, reintroduce a compatibility field, alter consumer roadmap records, or weaken the harness audit. It does not address unrelated roadmap-list presentation.

## Current state

`src/core/work/items.ts` still models `candidate` as an optional field, requires it exactly for Future records, and inserts or removes it during horizon moves. CLI contract fixtures therefore encode the retired field in inventory, statistics, malformed-item, and move coverage.

## Steps

- [x] Remove `candidate` from the native work-item field model and accept Future items without it.
- [x] Stop horizon moves from writing or projecting the retired field.
- [x] Update CLI-driven roadmap fixtures to exercise valid Future records without `candidate` and reject the retired field as unsupported.
- [x] Run focused roadmap CLI tests, full coverage, type-checking, formatting, dependency, build, and repository audits.

## Files touched

- `src/core/work/items.ts`
- `src/tests/cli/repo/roadmap.test.ts`
- This roadmap record

## Verify

- `bunx vitest run src/tests/cli/repo/roadmap.test.ts`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bunx biome check .`
- `bunx knip`
- `bun run build`
- `ki repo audit --skill ki-work-roadmap --repo .`
- `ki repo audit --skill ki-engineering --repo .`
- `ki repo audit --repo .`

## Dependencies / blocks

No external dependency. The compatible Harness contract already rejects `candidate`; this change brings the native reader and horizon mutation path into alignment.

## Documentation impact

### Decision Records

No change: this removes an obsolete implementation rule rather than choosing a new contract.

### Specifications

No specification change expected; current Harness governance already defines the accepted work-item shape.

### Guides

No guide change expected; `candidate` is retired and should not be documented as an option.

### Roadmap

Keep this record current through implementation, verification, and review handoff.

## Review

### Delivered

Aligned native roadmap parsing and horizon mutation with the current Harness contract from immutable baseline `04ea8dc51a2ffefa2e4e0f65a4b7139abbb5c3f0`. Future work items now parse without `candidate`, and no native move writes or projects the retired field. Horizon meanings, consumer records, and unrelated presentation remain unchanged.

### Summary of changes

Removed `candidate` from the strict work-item field model, validation rule, returned item projection, and horizon renderer in `src/core/work/items.ts`. Updated CLI-boundary fixtures in `src/tests/cli/repo/roadmap.test.ts` so project and Knowledge Base Future records omit it, strict project records reject it as unsupported, aggregate diagnostics remain covered, and Future horizon moves preserve body text without generating frontmatter.

### Verification

- Focused roadmap suite: 22 tests passed.
- Full coverage gate: 753 tests passed with 100% statements, branches, functions, and lines.
- `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, and `bun run build` passed. Knip reported only the existing `.claude/skills/**` configuration hint.
- `ki-work-roadmap` and `ki-engineering` audits passed; the full repository audit passed all 18 skills.

### Outstanding concerns

None.

### Post-change review

The implementation removes the obsolete concept completely rather than retaining a compatibility branch. Parser, mutation, and CLI contract fixtures agree on one current schema; the change is confined to the approved boundary and retains complete CLI-level coverage.

### Mini recap

CLI-069 is delivered and verified at `awaiting-review`. Native roadmap commands now accept standards-compliant Future items and reject the retired strict-project field without changing other roadmap semantics.

## Discussion

### Contract ownership

Compatible harnesses own work-item semantics; the native CLI should consume that current contract rather than preserve an older interpretation independently.

### Migration behaviour

Implementation should remove the Future-only `candidate` requirement and update CLI-driven fixtures covering both valid Future records and genuinely malformed items. Historical `candidate` fields remain governed by the harness audit rather than accepted as a second schema.
