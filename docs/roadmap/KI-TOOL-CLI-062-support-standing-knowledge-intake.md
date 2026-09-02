---
id: KI-TOOL-CLI-062
title: Support standing knowledge intake
area: CLI
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Expose safe CLI operations for the harness-defined `ki-trades` standing knowledge-intake contract without weakening repository ownership or itemized-trade fallback.

## Context

`GDR-KI-HARNESS-005` now permits receiver-owned knowledge subtype vocabularies, exact two-sided standing grants, and marked `STI-*` receiver-local provenance. `tools-ki` already owns `ki trade routes` mutation, route inspection, record lifecycle operations, and the public `ki` executable, so it owns the user-facing mutation and inspection seam for the new configuration and capture form.

## Boundary

Implement only locally owned configuration and capture operations. Never write a peer repository, infer reciprocal consent, treat Agora membership as authority, create standing work intake, or turn an itemized subtype into standing authority. Preserve existing `ki trade` behaviour when `subtypes` and `standing` are absent.

## Current state

The CLI supports ordinary `work` and `knowledge` routes but has no command contract for receiver-owned subtype definitions, exact standing import/export declarations, or `STI-*` capture creation and inspection.

## Steps

- [ ] Extend the parsed trade configuration model with receiver-owned knowledge subtypes and standing import/export declarations.
- [ ] Add local-only CLI operations to define/list/remove knowledge subtypes and add/list/check/remove exact standing grants.
- [ ] Add a receiver-local capture operation that writes a marked `STI-*` block only after validating the active reciprocal route and exact committed source reference.
- [ ] Preserve itemized fallback and refuse unknown, one-sided, cross-kind, malformed, revoked, or ambiguous grants.
- [ ] Cover commands through the in-process CLI seam, including existing-configuration compatibility and peer-write refusal.

## Files touched

- `src/core/trade/`
- `src/commands/trade/`
- `src/tests/cli/trade/`
- User-facing command help and guide surfaces affected by the final command shape
- This work item

## Verify

- Focused `ki trade` CLI tests
- `bun run test`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- Repository and engineering audits required by this repository

## Dependencies / blocks

No implementation blocker remains. Consume the committed harness contract in `GDR-KI-HARNESS-005` and `ki-trades`; do not duplicate or reinterpret its authority model.

## Documentation impact

### Decision Records

No new decision is expected unless implementation requires a material departure from the harness-owned standing-intake authority model.

### Specifications

Update the CLI specification if new public command behaviour is normative.

### Guides

Document the final subtype, standing-route, and capture workflow with an itemized fallback example.

### Roadmap

This record is the receiver-owned follow-on from `KI-HARNESS-GOV-047`.

## Discussion

The viable first slice should favour explicit subcommands and closed validation over automatic capture. Route activation remains reciprocal evidence; a command may report the missing other side but must never create it.
