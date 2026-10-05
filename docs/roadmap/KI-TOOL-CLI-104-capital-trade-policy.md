---
id: KI-TOOL-CLI-104
area: CLI
title: Capital trade policy
theme: cli
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-06T10:00:00Z
updated_at: 2026-10-06T10:00:00Z
---

# Capital trade policy

## Goal

`ki` takes trade routes and standing-intake grants only from the territory Capital's policy, sweeps the territory for named islands that have not declared `ki-trades`, and produces a read-only migration report before the switch.

## Context

The owner approved Capital-only route governance on 2026-10-06 in [KI-ARCADIA-GOV-016](https://github.com/knowledgeislands/ki-arcadia-principal/blob/main/Streams/Roadmap/KI-ARCADIA-GOV-016-territorial-classification-and-exchange.md). Routes are today parsed from member `.ki.toml` tables in `src/core/trade/configuration.ts` and resolved pairwise in `estate.ts`, `delivery.ts` and `standing-intake.ts`. The harness's share is `KI-HARNESS-GOV-122`.

The policy is a `[skills.ki-trades.territory]` table in the Capital's own `.ki.toml`: `name`, `members`, `[[skills.ki-trades.territory.channels]]` (`id`, `purpose`, `from`, `to`, `kinds`) expanding to exact `(source, receiver, kind)` triples, and `[[skills.ki-trades.territory.standing]]` grants. The Capital is the unique registered repository whose `.ki.toml` declares `[skills.ki-trades.territory]` listing the island as a member, resolved as Agora homes already are. None is unavailable and several is ambiguous; both fail closed, and no Agora is consulted.

## Boundary

- Delivered in three releases: A additive (parser, resolver, `policy check`, `policy migration-report`; legacy tables stay authoritative), B the switch (policy is the only authority; no fallback), C retirement (legacy keys FAIL; remove legacy parser and report).
- `ki/trade-routes/v1` output stays byte-compatible for apps-observatory.
- `TRD-8004751b` and `TRD-d03495e9` are never rewritten; no route a live record depends on may be removed.
- No release is cut or published without the owner's request.

## Current state

Draft. Route authority today comes from paired member `.ki.toml` tables; no territory table or Capital resolver exists, and `parseConfiguration` rejects unknown `ki-trades` keys.

## Steps

- [ ] Release A: `configuration.ts` accepts the `territory` sub-table so Arcadia can declare it without breaking current audits; new `src/core/trade/policy.ts` (`parseTradePolicy`, `policyEdges`, `policyGrants`) and `capital.ts` (`resolveCapitalPolicy`, `requireCapitalPolicy`, reusing Agora home resolution over registered `.ki.toml` files); new `commands/trade/policy.ts` with `show`, `check` (conforming, failing, unverifiable, ambiguous; non-zero on failing) and `migration-report` (`ki/trade-policy-migration/v1`); move the current parser to `legacy-configuration.ts` for the report.
- [ ] Release B: `estate.ts`, `delivery.ts`, `standing-intake.ts`, `preparations.ts` and `lifecycle.ts` read policy edges and grants; `configuration.ts` keeps `repository`, `identity` and `mapBonus` and reports legacy keys as diagnostics only; remove route, standing and subtype mutators and their `add`/`remove` commands.
- [ ] Release C: retire the legacy parser and migration report.
- [ ] Tests: new `policy.test.ts` (parser refusals, resolver states, territory table outside a Capital refused, Agora grants nothing, sweep states, report equality and pending direction, uncovered record); policy fixtures in `trade.test.ts` and `standing-intake.test.ts`; `roadmap.test.ts` fixture; v1 route-report snapshot.

## Files touched

- `src/core/trade/` (`policy.ts`, `capital.ts`, `legacy-configuration.ts` new; `configuration.ts`, `estate.ts`, `delivery.ts`, `standing-intake.ts`, `preparations.ts`, `lifecycle.ts`, `configuration-mutations.ts`, `route-report.ts`)
- `src/commands/trade/` (`policy.ts` new; `routes/index.ts`, `standing.ts`, `subtypes.ts`)
- `src/tests/cli/trade/`, `src/tests/cli/repo/roadmap.test.ts`

## Verify

- `bun test` and `ki repo audit` pass.
- Against the Capital policy, `policy migration-report` shows every active legacy direction and standing grant covered, the pending `tools-techne` to `homebrew-tap` direction as an explicit decision, and both open records covered.
- `policy check` from Arcadia reports no failing island after member tables are stripped.

## Dependencies / blocks

No local dependency. The cross-repository relationship is recorded under Discussion.

## Documentation impact

### Decision Records

None in this repository; authority is decided in Arcadia and the harness.

### Specifications

Trade command specification for `ki repo trade policy` and the removed route mutators.

### Guides

Command help.

### Roadmap

None beyond this record.

## Discussion

### Cross-repository relationship

This item is blocked by `knowledgeislands/ki-arcadia-principal` `KI-ARCADIA-GOV-016`, which settles the policy authority and schema. Release B ships together with `knowledgeislands/ki-agentic-harness` `KI-HARNESS-GOV-122`, because the harness rubric parses routes independently.
