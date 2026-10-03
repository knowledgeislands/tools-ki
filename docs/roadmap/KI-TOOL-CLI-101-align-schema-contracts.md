---
id: KI-TOOL-CLI-101
area: CLI
title: Align schema contracts
theme: cli
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-03T04:00:16Z
updated_at: 2026-10-03T04:00:16Z
---

## Goal

Remove version metadata from newly written user-authored KI configuration and align each generated public contract to its own v1 identity, preserving current behaviour.

## Context

KI has several input, public-output and persisted-state version markers. The public registry and other named v1 contracts already demonstrate additive pre-release evolution. Roadmap statistics still identify version 2, and the Granola checkpoint uses version 3; those are not automatically the same kind of contract. The approved estate rule is no schema field in new user-authored config, one v1 identity per generated contract, no estate-wide version, and no `latest`, `pre-release` or `0` marker.

## Boundary

Inventory every actual file and consumer before changing it. Read an old versioned input only if its structure is recognised; offer explicit previewed repair, never implicit writes on reads or non-interactive prompts. Public output may gain fields within v1 and consumers should tolerate additive fields. Durable internal state needs an explicit migration and tests, not a blind numeric rewrite. Preserve unrelated current registry work in this checkout.

## Current state

Version treatment varies by file and contract. The repository has unrelated in-progress registry changes, so this record does not modify those code or documentation paths.

## Steps

- [ ] Inventory user-authored inputs, public generated contracts, internal persisted state, and their exact consumers.
- [ ] Make newly written user-authored inputs unversioned with structurally safe legacy reads and explicit previewed repair.
- [ ] Align generated public output contracts above v1 to per-contract v1 without capability loss, and test additive-field consumers.
- [ ] Plan and test any persisted-state migration separately, then align guides, specifications, help, completion and manual where applicable.

## Files touched

- KI config parsers/writers and their tests after the current registry work is settled
- Public output producers and consumers, including roadmap statistics
- Persisted-state adapters and migration tests where necessary
- User guide, specifications, help, completion, manual and this record

## Verify

Run the full KI repository and tool gates, plus per-contract tests for old known files, unknown shape rejection, previewed repair, non-interactive no-write behaviour, preserved output fields and persisted-state migration.

## Dependencies / blocks

Do not overlap the unrelated uncommitted registry changes. A Ready plan must enumerate exact contracts and separate public output from internal durable state before implementation.

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
