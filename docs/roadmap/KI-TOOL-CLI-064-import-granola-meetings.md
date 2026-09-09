---
id: KI-TOOL-CLI-064
title: Import Granola meetings
area: CLI
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 5d77b1740b05583c76fa5dce65377a1f50413272
---

## Goal

Implement provider-neutral, complete, resumable Granola acquisition into an explicitly selected eligible repository's Harbour.

## Context

Harness `KI-HARNESS-OPS-006` and `ki-housekeeping-granola` define the accepted read-only source, fidelity, receiver-selection, completeness, checkpoint, amendment, and retirement boundaries. `tools-ki` owns the public `ki acquire <provider> import` grammar, repository resolution, KEP construction, atomic staging, and acquisition ledger.

## Boundary

Do not mutate Granola, automate a browser, infer missing source fields, write another repository directly, hide unmatched or conflicting meetings, or conflate successful acquisition with harvesting or retirement. Preserve the existing `ki acquire chatgpt import --output` contract while generalising the provider-neutral KEP core.

## Current state

The CLI has a ChatGPT-specific acquisition path and KEP implementation but no Granola provider profile, complete-history enumeration, receiver selectors, or amendment-aware checkpoint loop.

## Steps

- [x] Establish one public `ki acquire granola import` operation using the existing repository-selection convention.
- [x] Generalise the KEP core into a provider-neutral builder and add one immutable package per Granola meeting version.
- [x] Enumerate global and folder-scoped history through saturation-aware ISO-date windows, deduplicating stable UUIDs and failing closed when completeness cannot be proven.
- [x] Implement explicit folder, unfoldered, residual, overlap, unmatched, and intentional-duplication receiver outcomes.
- [x] Preserve exact detail and transcript projections, hashes, provenance, query-derived folder evidence, and explicit omissions.
- [x] Stage atomically beneath `+/_ACQUIRE/granola/<payload-sha256>/` and advance the local ledger only after manifest verification.
- [x] Re-read and hash existing identities for amendment detection; never infer deletion from scope exit or missing results.
- [x] Cover interruption, corrupted stages, repeated checkpoints, saturated windows, conflicting receivers, unavailable fields, and no-mutation guarantees through the CLI seam.

## Files touched

- Acquisition commands and repository selection
- Provider-neutral KEP core and Granola profile
- Harbour transaction and ledger modules
- `src/tests/cli/` acquisition fixtures
- CLI specification, manual, and changelog
- This work item

## Verify

- Focused acquisition CLI tests
- `bun run test`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- Repository and engineering audits required by this repository

## Dependencies / blocks

No Harness contract blocker remains. Direct receiver rollout additionally needs each receiving repository's own Granola selector and Harbour work accepted locally.

## Documentation impact

### Decision Records

Amend or add a decision only if KEP generalisation or CLI compatibility requires a material architecture choice.

### Specifications

Specify public grammar, completeness, fidelity, checkpoint, amendment, and fail-closed receiver behaviour.

### Guides

Document setup, complete first import, routine reconciliation, recovery, and explicit omissions.

### Roadmap

This is the receiver-owned CLI delivery from `KI-HARNESS-OPS-006`; no trade remains required.

## Review

### Delivered

Implemented the approved Granola acquisition boundary from immutable baseline `5d77b1740b05583c76fa5dce65377a1f50413272` in commit `e07a2a250d60591679c028f5978d963e4b828c88`. The public command, provider adapter, receiver routing, provider-neutral KEP publication, verified ledger, contract tests, specifications, guide, README, changelog, completions, and man page are present. The source-mutation, browser-automation, harvesting, cross-repository-write, archive, deletion, and retirement exclusions held.

### Summary of changes

- Added `ki acquire granola import` with explicit receiver, interval, and dry-run options.
- Added allowlisted read-only `mcporter` calls, schema and account identity hashing, saturation-aware exhaustive windows, stable-identity deduplication, and fail-closed response validation.
- Added registered-receiver folder, unfoldered, residual, exclusion, conflict, and deliberate-duplication reconciliation.
- Added immutable content-addressed meeting KEPs, explicit source omissions, checksum verification, amendment history, interruption recovery, and a ledger written last.
- Split ChatGPT acquisition into its provider module and exposed both providers through the `core/acquire` barrel while sharing the KEP core.
- Added CLI-boundary fixtures and tests plus synchronized public documentation. No architecture Decision Record was needed because the change applies the already-approved provider-adapter and KEP boundaries.

### Verification

- `bunx vitest run src/tests/cli/acquire --reporter=dot` — PASS, 45 focused acquisition contract tests.
- `bunx tsc --noEmit` — PASS.
- `bun run test --reporter=dot` — PASS.
- `bun run test:coverage --reporter=dot` — PASS at 100%: 6,738/6,738 lines, 1,871/1,871 functions, and 4,479/4,479 branches.
- `bunx biome check` — PASS.
- `bun run ki:tools:lint-man` — PASS.
- `ki repo audit --skill ki-engineering --repo .` — PASS; the same command also passed separately for `ki-self`, `ki-specs`, `ki-guides`, `ki-authoring`, `ki-work-roadmap`, `ki-repo-tools`, and `ki-repo`.
- `git diff --check` — PASS.

### Outstanding concerns

Live-account acceptance remains for the human review: no Granola account or receiving repository was authorised for a real import in this delivery. This workstation's default `mcporter` daemon directory also reports its existing legacy-mode migration requirement, which must be resolved in local `mcporter` setup before that trial. The implementation and deterministic contract suite do not depend on that machine state.

### Post-change review

The goal and approved scope are met, the ChatGPT contract remains green, public surfaces agree, and repository boundaries are clean. The material residual risk is future variation in Granola's MCP response schemas or result cap; schema hashing, explicit response validation, exhaustive window splitting, and fail-closed behavior make that risk visible instead of silently losing evidence. The item is ready for human review and a live dry-run.

### Mini recap

CLI-064 now provides a complete, read-only, resumable path from Granola MCP observations to verified receiver-local meeting KEPs. Verification is clean and the only remaining action is human acceptance with local Granola credentials and receiver selectors. No new portable learning route is proposed: the implementation follows the existing Harness Granola contract.

## Discussion

The viable first delivery should favour an exhaustive, safe initial import and repeatable recovery over throughput optimisation. Source retirement remains a separate future operation with its own immediate human gate.
