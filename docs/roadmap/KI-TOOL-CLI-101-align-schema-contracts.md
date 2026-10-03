---
id: KI-TOOL-CLI-101
area: CLI
title: Align schema contracts
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-03T04:00:16Z
updated_at: 2026-10-03T06:46:03Z
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

- [ ] Confirm the inventory above against tests and consumers, preserving private persisted-state migration markers.
- [ ] Make `renderConfiguration` omit `schema`, accept absent or recognised legacy `schema = 1`, and reject unknown values or malformed shape without writing.
- [ ] Make `ki manage diag` explain the legacy marker and `ki manage repair --dry-run` preview its exact removal; only an explicit `ki manage repair` rewrites that recognised line while preserving other content.
- [ ] Change roadmap-stats JSON to version 1 without dropping fields; update contract tests and specification.
- [ ] Align user guide, help, completion and manual where affected; run the full KI gate with CLI tests for preview, repair, unknown shape and no-write reads.

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

## Discussion

This record deliberately avoids inventing one KI-wide schema number. It is an inventory and migration boundary, not permission to renumber internal checkpoints without preserving their data.
