---
id: KI-TOOL-CLI-062
title: Support standing knowledge intake
area: CLI
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 3274a8cc330a8e1baf8a222ac1bbf9d4417cd22f
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

- [x] Extend the parsed trade configuration model with receiver-owned knowledge subtypes and standing import/export declarations.
- [x] Add local-only CLI operations to define/list/remove knowledge subtypes and add/list/check/remove exact standing grants.
- [x] Add a receiver-local capture operation that writes a marked `STI-*` block only after validating the active reciprocal route and exact committed source reference.
- [x] Preserve itemized fallback and refuse unknown, one-sided, cross-kind, malformed, revoked, or ambiguous grants.
- [x] Cover commands through the in-process CLI seam, including existing-configuration compatibility and peer-write refusal.

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

## Review

### Delivered

Implemented the approved standing knowledge-intake boundary from immutable baseline `3274a8cc330a8e1baf8a222ac1bbf9d4417cd22f`. Delivery commit `d2187cf710fd5b663dcdaec13ccbe291314727b3` adds receiver-owned subtype management, exact reciprocal standing-grant management and inspection, and validated receiver-local `STI-*` capture without peer writes or inferred roadmap authority.

### Summary of changes

- Extended the trade configuration codec in `src/core/trade/configuration.ts` and isolated local rendering and mutation in `src/core/trade/configuration-mutations.ts`.
- Added focused `ki trade subtypes` and `ki trade standing` command adapters in `src/commands/trade/`.
- Added exact-grant inspection and commit-pinned local capture in `src/core/trade/standing-intake.ts`.
- Added CLI-contract coverage in `src/tests/cli/trade/standing-intake.test.ts` and synchronized completion coverage.
- Published the as-built contract in `docs/specs/trades.md`, the operating workflow in `docs/guides/standing-knowledge-intake.md`, and matching README, changelog, completion, and manual surfaces.

### Verification

- `bunx vitest run src/tests/cli/trade/standing-intake.test.ts src/tests/cli/trade/trade.test.ts src/tests/cli/manage/completions.test.ts` — 51 tests passed.
- `bun run test` (`bunx vitest run --reporter=dot`) — 47 files and 719 tests passed.
- `bun run test:coverage` (`bunx vitest run --coverage --reporter=dot`) — 100% statements, branches, functions, and lines.
- `bunx tsc --noEmit` — passed.
- `bunx biome check .` — passed with no fixes required.
- `bun run ki:tools:lint-man` — passed.
- `ki repo audit --skill ki-engineering --repo .` — passed after removing unused standing-intake barrel exports found by Knip.
- `ki repo audit --skill ki-self --repo .`, `ki-trades`, `ki-specs`, `ki-guides`, `ki-authoring`, `ki-work-roadmap`, and `ki-repo` — passed.

### Outstanding concerns

None. No live peer repository, network service, release, or publication was required or changed.

### Post-change review

The delivered commands satisfy the stated goal and remain within the receiver-local authority boundary. Existing configurations without subtype or standing tables retain their behaviour, existing trade tests pass unchanged, ordinary knowledge trades remain the fallback, route and subtype removal protect active local dependencies, and malformed or incomplete grants fail closed. The command, core, test, specification, guide, completion, README, changelog, and manual surfaces are aligned and ready for acceptance review.

### Mini recap

The delivery established that standing-intake configuration mutation is a cohesive concern separate from parsing, so it was split into `configuration-mutations.ts` rather than enlarging the codec. That applies the repository's existing modularity rule directly; no new durable learning route is proposed. Verification found and removed accidental unused core-barrel exports before review. No item-scoped work remains outside human acceptance.

## Discussion

The viable first slice should favour explicit subcommands and closed validation over automatic capture. Route activation remains reciprocal evidence; a command may report the missing other side but must never create it.
