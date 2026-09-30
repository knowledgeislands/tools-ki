---
id: KI-TOOL-CLI-098
area: CLI
title: Modularise Agora resolution
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-30T09:46:47Z
updated_at: 2026-09-30T09:46:47Z
---

# KI-TOOL-CLI-098: Modularise Agora resolution

## Goal

Agora registry inspection, declaration parsing, reciprocal resolution, and health reporting have clear internal boundaries, making future contract changes easier to implement safely.

## Context

`src/core/agora/resolution.ts` currently combines all four concerns in one large module. CLI-089 may later change the membership contract, but that contract is not yet approved; a behavior-preserving separation can land independently.

## Boundary

Do not change role requirements, diagnostics, public exports, CLI output, or any repository declaration. Do not implement CLI-089 by inference.

## Current state

One 643-line module owns registry I/O, home/member parsing, profile resolution, and audit health assembly.

## Steps

- [ ] Extract cohesive registry/declaration and health responsibilities behind typed internal modules without circular dependencies.
- [ ] Keep public Agora API stable and prove behavior parity through existing and focused tests.
- [ ] Document only meaningful architecture seam changes, not a new user contract.

## Files touched

`src/core/agora/resolution.ts`, new internal Agora modules, exports only if necessary, and Agora tests.

## Verify

Focused Agora tests, type check, Biome, architecture checks, and full coverage gate pass.

## Dependencies / blocks

None. CLI-089 remains dependent on the external role-free contract and is not part of this item's behavior change.

## Documentation impact

### Decision Records

No new decision; ADR-KI-TOOLS-001 already places domain behavior in core modules.

### Specifications

No behavior change to specify.

### Guides

No user guidance changes.

### Roadmap

Record delivery here and retain CLI-089 as the separate role-free follow-up.

## Discussion

### Refactor boundary

Move existing logic at domain seams, preserving error text and ordering. Treat any discovered behavior change as a stop rather than folding it into the refactor.
