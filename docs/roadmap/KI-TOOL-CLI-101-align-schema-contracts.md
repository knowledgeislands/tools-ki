---
id: KI-TOOL-CLI-101
area: CLI
title: Align schema contracts
theme: cli
horizon: next
status: done
blocks: []
blocked_by: []
baseline_ref: d4c31950dfd3d133b81a608b2d4d69cbc0f823c5
created_at: 2026-10-03T04:00:16Z
updated_at: 2026-10-03T07:30:08Z
---

## Goal

Remove version metadata from newly written user-authored KI configuration and align each generated public contract to its own v1 identity, preserving current behaviour.

## Context

KI has several input, public-output and persisted-state version markers. The public registry and other named v1 contracts already demonstrate additive pre-release evolution. Roadmap statistics still identify version 2, and the Granola checkpoint uses version 3; those are not automatically the same kind of contract. The approved estate rule is no schema field in new user-authored config, one v1 identity per generated contract, no estate-wide version, and no `latest`, `pre-release` or `0` marker.

## Boundary

Inventory every actual file and consumer before changing it. Read an old versioned input only if its structure is recognised; offer explicit previewed repair, never implicit writes on reads or non-interactive prompts. Public output may gain fields within v1 and consumers should tolerate additive fields. Durable internal state needs an explicit migration and tests, not a blind numeric rewrite. Preserve unrelated current registry work in this checkout.

## Current state

The only KI-authored user configuration with a required version field is `$KI_CONFIG_HOME/config.toml`, rendered and inspected in `src/agents/configuration.ts`. The public roadmap-stats JSON in `src/commands/repo/roadmap.ts` emits `version: 2`. Other named public JSON contracts already identify v1. `registry.toml`, Agora reference associations, installation and managed-artifact receipts, and Granola checkpoints are private persisted state; their on-disk migration markers are not public generated-output identities. The checkout is now clean.

## Steps

- [x] Confirm the inventory above against tests and consumers, preserving private persisted-state migration markers.
- [x] Make `renderConfiguration` omit `schema`, accept absent or recognised legacy `schema = 1`, and reject unknown values or malformed shape without writing.
- [x] Make `ki manage diag` explain the legacy marker and `ki manage repair --dry-run` preview its exact removal; only an explicit `ki manage repair` rewrites that recognised line while preserving other content.
- [x] Change roadmap-stats JSON to version 1 without dropping fields; update contract tests and specification.
- [x] Align user guide, help, completion and manual where affected; run the full KI gate with CLI tests for preview, repair, unknown shape and no-write reads.

## Files touched

- `src/agents/configuration.ts`, `src/agents/internal.ts`, `src/core/manage/repair.ts`, `src/commands/manage/repair.ts`
- `src/commands/repo/roadmap.ts` and focused CLI tests under `src/tests/cli/`
- `docs/specs/repository-operations.md`, `docs/guides/user/local-installation.md`, `man/ki.1`, README/help/completion only where the active surface changes
- This roadmap item

## Verify

Run `ki repo audit --repo .`, `bun run test:coverage`, `bun run build`, `bunx biome check`, `bun run ki:tools:lint-man`, and CLI tests for recognised legacy preview/repair, unknown shape rejection, no-write ordinary reads, unversioned new config, and unchanged roadmap-stats fields with version 1. Confirm the private persisted-state formats and migration tests remain unchanged and passing.

## Dependencies / blocks

No external dependency. Do not renumber private persisted-state checkpoints as a cosmetic change: they need their version markers for migration and do not participate in the public output contract. Stop if an actual external consumer requires roadmap-stats version 2 or a legacy config shape cannot be recognised safely.

## Documentation impact

### Decision Records

Record any state-migration choice that materially changes recovery semantics.

### Specifications

Document per-contract v1 output and recognised unversioned input shapes.

### Guides

Explain explicit repairs and any persistence migration to operators.

### Roadmap

Record each contract's verified treatment here or split into bounded delivery records during planning.

## Review

### Delivered

The approved public contract alignment is ready for acceptance against baseline `d4c31950dfd3d133b81a608b2d4d69cbc0f823c5`. Private persisted-state migration markers and their consumers were left unchanged.

### Change Summary

New user configuration omits `schema`; reads accept an absent marker or recognised `schema = 1` and reject unknown values. Diagnostics identify legacy metadata, while `ki manage repair --dry-run` previews its removal and an explicit repair removes only the simple top-level marker. Roadmap-stats JSON identifies its contract as v1 without dropping fields. CLI help, manual, guides, specifications, inventory, and focused tests were aligned.

### Verification

`bun run test:coverage --reporter=dot` passed with 960 tests and full coverage. `bun run build`, `bunx biome check`, `bunx tsc --noEmit`, `bun run ki:tools:lint-man`, `ki repo audit --repo .`, and `git diff --check` passed. Focused CLI tests cover legacy preview and repair, malformed marker refusal, unversioned bootstrap, and roadmap-stats v1 output.

### Outstanding concerns

None within the approved boundary. Human acceptance is still required; no release or tag was made.

### Post-change review

The change keeps ordinary reads non-mutating and confines rewriting to an explicit, recognised legacy repair. Public output retains its existing shape apart from the per-contract version identity; internal recovery markers remain intact. The item is ready for acceptance review.

### Mini recap

KI now writes unversioned user configuration and reports roadmap-stats v1; legacy config can be repaired explicitly. Tests and repository checks passed. No further learning route is proposed beyond the updated specifications and guide.

## Done

Accepted 2026-10-03 by Kris Brown on the review packet above.

## Discussion

This record deliberately avoids inventing one KI-wide schema number. It is an inventory and migration boundary, not permission to renumber internal checkpoints without preserving their data.
