---
id: KI-TOOL-CLI-051
area: CLI
title: Honor Agora projection order
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: 3b881b5ae47f4d6856b18aae29b6e708b071ed0c
transferred_from: TRD-ace87343
---

# KI-TOOL-CLI-051: Honor Agora projection order

## Goal

Make every named Agora projection honor the home repository's declared ordering prefix while retaining deterministic ordering for members the home does not list.

## Context

Inbound work trade `TRD-ace87343` carries the `ki-agora` `CONFIG-1` contract: an optional `order` array may contain a duplicate-free ordered prefix of canonical repository identities already participating in the home. The `ki-all` home now uses that contract to place chezmoi first, followed by the Agentic Harness, `tools-ki`, `tools-mgit`, and Homebrew Tap.

The current resolver in `src/core/agora/index.ts` accepts only `owner`, `purpose`, and `members`, then sorts every resolved member by local registry key. Named Agora output therefore discards the home declaration's intended presentation order before `show`, `roots`, `open`, and repository selection consume the profile.

## Boundary

Keep the system-managed `estate` profile lexical. Do not change Agora membership, reciprocal consent, roles, priority, routing, or authority. Preserve current named-Agora behavior when `order` is absent, and do not permit an order entry to introduce a repository that is not already the owner or a declared reciprocal member.

## Current state

`homeDeclarations()` in `src/core/agora/index.ts` validates `owner`, `purpose`, and `members` but ignores any `order` value. `profileFromHome()` resolves the owner and reciprocal members, then sorts the entire projection by local registry key. `ki agora show`, `ki agora roots`, `ki agora open`, and `ki repo --agora` all consume that one profile sequence, so correcting the resolver is sufficient to align every consumer. The reserved `estate` profile already derives its lexical order from the sorted local registry and must remain unchanged.

The existing Agora CLI suite drives all relevant behavior through the in-process `run(args, context)` seam. README and `docs/specs/agoras.md` currently promise deterministic registry-key order without distinguishing declared named Agoras from the system estate.

## Steps

- [x] Extend the parsed home contract with optional `order`, validating that it is an array of unique canonical repository identities and that every entry is the owner or a declared member.
- [x] Resolve named Agora members by the declared prefix followed by unlisted participants in lexical local-key order, while leaving the `estate` construction unchanged.
- [x] Extend CLI-level Agora coverage for owner placement, partial prefixes, absent-order compatibility, duplicate and unknown entries, and consistent order through show, roots, open, and repository selection.
- [x] Update the Agora specification and README to describe declared prefix ordering and the lexical remainder and estate behavior.

## Files touched

- `src/core/agora/index.ts` — home declaration parsing, validation, and named-profile ordering.
- `src/tests/cli/agora/agora.test.ts` — public CLI contract coverage for valid and invalid ordering declarations and downstream consumers.
- `docs/specs/agoras.md` — behavior-level ordering requirements and verification pointer.
- `README.md` — user-facing declaration and roots-order guidance.
- This roadmap record and the adopted inbound trade.

## Verify

1. `bunx vitest run src/tests/cli/agora/agora.test.ts` passes the focused CLI contract suite.
2. `bun run test:coverage` retains 100% statements, branches, functions, and lines.
3. `bunx tsc --noEmit` and `bun run build` pass.
4. `ki repo audit --repo .` reports no new failures or warnings beyond the repository's documented release-marker warning.
5. A named fixture with an order prefix produces that sequence through `show`, `roots`, `open`, and `repo --agora`; the same fixture without `order` and the `estate` selector retain lexical local-key order.

## Dependencies / blocks

The canonical `ki-agora` contract and the submitted `TRD-ace87343` handoff are available. No local roadmap dependency blocks implementation.

## Documentation impact

### Decision Records

No new decision record is needed; the ordering semantics are already governed by the canonical `ki-agora` contract and this work implements that accepted external contract.

### Specifications

Update `docs/specs/agoras.md` with explicit requirements for optional declared prefixes, validation, deterministic lexical remainder, and unchanged estate ordering.

### Guides

Update README's Agora configuration and roots-order explanation. No separate operational guide is needed for the optional field.

### Roadmap

Completion resolves adopted trade `TRD-ace87343`. It does not block `KI-TOOL-CLI-052`, whose KB Streams projection defect is independently executable.

## Review

### Delivered

Implemented the approved named-Agora ordering boundary from immutable baseline `3b881b5ae47f4d6856b18aae29b6e708b071ed0c`; implementation evidence is commit `1816131fea639f79a77c9f64768b10ad611c8ebe`. The change does not alter reciprocal membership, local registration, Agora authority, profile naming, or the system-managed `estate` order.

### Summary of changes

`src/core/agora/index.ts` now parses and validates an optional canonical-identity `order` prefix and resolves named members as that prefix plus a lexical local-key remainder. `src/tests/cli/agora/agora.test.ts` exercises the prefix through show, roots, open, and repository selection while retaining absent-order and estate coverage; malformed arrays, identities, duplicates, and non-participants are rejected. `docs/specs/agoras.md` adds `AGORA-007`, and README documents the user-facing behavior. No approved deviation or delegation occurred.

### Verification

`bunx vitest run src/tests/cli/agora/agora.test.ts` passed 13 tests. `bun run test:coverage` passed all 665 tests with 100% statements, branches, functions, and lines. `bunx tsc --noEmit` and `bun run build` passed. `ki repo audit --repo .` passed all 17 selected skills with no warnings or failures.

### Outstanding concerns

None. Releasing or pruning adopted trade `TRD-ace87343` remains outside this implementation and follows the trade lifecycle separately.

### Post-change review

The resolver remains the single policy boundary used by every named Agora consumer, so no command-specific ordering branches were introduced. Validation occurs before projection use, the absent-order path preserves the prior lexical behavior, and `estate()` remains unchanged. The implementation satisfies the goal and approved boundary with CLI-level regression evidence and is ready for human acceptance.

### Mini recap

CLI-051 delivers validated declared ordering for named Agora projections, full CLI-consumer coverage, and synchronized specification and README guidance. All required gates pass and no implementation concern remains. The specification and README are the durable learning routes; no additional automatic promotion is proposed.

## Done

Accepted on 2026-08-21. The reviewed delivery satisfies the approved boundary, and refreshed focused tests, type checking, build, and trade audit passed.

## Discussion

### Contract shape

Parse `order` as canonical HTTPS repository identities. Validate uniqueness and participation in the declared home before resolution. The owner may appear in the prefix because it is an Agora participant even though it is represented separately from the `members` table.

### Deterministic remainder

Resolve the declared prefix first, then append every unlisted participant in the existing lexical local-key order. Keeping ordering in the resolved profile makes every downstream consumer observe one consistent sequence without duplicating policy.

### Verification boundary

Contract-level CLI tests should exercise valid prefixes, owner placement, duplicate and unknown entries, absent-order compatibility, and consistent ordering through named Agora display, roots, open, and repository selection.
