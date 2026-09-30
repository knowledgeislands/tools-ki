---
id: KI-TOOL-CLI-098
area: CLI
title: Modularise Agora resolution
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: ff4cfb72ac9abbb43bfd1f529f5fda8d5ee1e8e4
created_at: 2026-09-30T09:46:47Z
updated_at: 2026-09-30T10:48:07Z
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

- [x] Extract cohesive registry/declaration and health responsibilities behind typed internal modules without circular dependencies.
- [x] Keep public Agora API stable and prove behavior parity through existing and focused tests.
- [x] Document only meaningful architecture seam changes, not a new user contract.

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

## Review

### Delivered

The behavior-preserving Agora split is implemented from baseline `ff4cfb72ac9abbb43bfd1f529f5fda8d5ee1e8e4`. Role requirements, diagnostics, public exports, CLI output, and repository declarations are unchanged.

### Change Summary

`src/core/agora/resolution.ts` now orchestrates the public resolver with `repository-inventory.ts`, `declarations.ts`, `profiles.ts`, and `health.ts` owning the separate internal concerns. Shared runtime dependencies flow one way; type-only imports retain the public Agora types without runtime cycles.

### Verification

All 30 focused Agora CLI tests, TypeScript, Biome, and the `ki-self` architecture audit passed. `bun run test:coverage -- --reporter=dot` passed 940 tests with 100% statements, branches, functions, and lines.

### Outstanding concerns

Independent review and acceptance remain. Role-free behavior is intentionally excluded and remains in CLI-089 after the portable Harness contract is settled.

### Post-change review

The module split preserves tested behavior while making the declaration and health seams more local for future changes. The item is ready for review.

### Mini recap

Agora core concerns are separated without a user-facing contract change. CLI-089 remains the distinct role-free follow-up.

## Discussion

### Refactor boundary

Move existing logic at domain seams, preserving error text and ordering. Treat any discovered behavior change as a stop rather than folding it into the refactor.
