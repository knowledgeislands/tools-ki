---
id: KI-TOOL-CLI-064
title: Import Granola meetings
area: CLI
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Implement provider-neutral, complete, resumable Granola acquisition into an explicitly selected eligible repository's Harbour.

## Context

Harness `KI-HARNESS-OPS-006` and `ki-housekeeping-granola` define the accepted read-only source, fidelity, receiver-selection, completeness, checkpoint, amendment, and retirement boundaries. `tools-ki` owns the public `ki acquire <provider> import` grammar, repository resolution, KEP construction, atomic staging, and acquisition ledger.

## Boundary

Do not mutate Granola, automate a browser, infer missing source fields, write another repository directly, hide unmatched or conflicting meetings, or conflate successful acquisition with harvesting or retirement. Reconcile the existing `ki space acquire` and ChatGPT `--output` compatibility deliberately.

## Current state

The CLI has a ChatGPT-specific acquisition path and KEP implementation but no Granola provider profile, complete-history enumeration, receiver selectors, or amendment-aware checkpoint loop.

## Steps

- [ ] Establish one public `ki acquire granola import` operation using the existing repository-selection convention.
- [ ] Generalise the KEP core into a provider-neutral builder and add one immutable package per Granola meeting version.
- [ ] Enumerate global and folder-scoped history through saturation-aware ISO-date windows, deduplicating stable UUIDs and failing closed when completeness cannot be proven.
- [ ] Implement explicit folder, unfoldered, residual, overlap, unmatched, and intentional-duplication receiver outcomes.
- [ ] Preserve exact detail and transcript projections, hashes, provenance, query-derived folder evidence, and explicit omissions.
- [ ] Stage atomically beneath `+/_ACQUIRE/granola/<payload-sha256>/` and advance the local ledger only after manifest verification.
- [ ] Re-read and hash existing identities for amendment detection; never infer deletion from scope exit or missing results.
- [ ] Cover interruption, corrupted stages, repeated checkpoints, saturated windows, conflicting receivers, unavailable fields, and no-mutation guarantees through the CLI seam.

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

## Discussion

The viable first delivery should favour an exhaustive, safe initial import and repeatable recovery over throughput optimisation. Source retirement remains a separate future operation with its own immediate human gate.
