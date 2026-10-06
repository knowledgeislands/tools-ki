---
id: KI-TOOL-CLI-104
area: CLI
title: Capital trade policy
theme: cli
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 3f96f18680c8792a837ecba1931e03ab59112741
created_at: 2026-10-06T10:00:00Z
updated_at: 2026-10-06T12:00:00Z
---

# Capital trade policy

## Goal

`ki` takes trade routes, standing-intake grants and knowledge subtypes only from the territory Capital's policy. Every repository names its Capital, and the Capital lists its members. `ki repo trade policy check` sweeps the territory for members that do not conform. `ki repo trade policy compare` proves that the switch loses no active route.

## Context

The owner approved Capital-only route governance on 2026-10-06 in [KI-ARCADIA-GOV-016](https://github.com/knowledgeislands/ki-arcadia-principal/blob/main/Streams/Roadmap/KI-ARCADIA-GOV-016-territorial-classification-and-exchange.md). On the same day the owner collapsed the staged plan into a single change: "just push this through and just get to where we want to be in the config". There are no additive or legacy-compatible layers. A single release is cut once verification passes, and the coordinator cuts it, not this item. Capital declaration is mandatory and FAILs immediately, with no warning phase. The harness's share is [KI-HARNESS-GOV-122](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-122-capital-governed-trade-routes.md).

The schema has three parts:

- Every `.ki.toml` declares `capital = "<canonical HTTPS URL>"` in `[skills.ki-repo]`, and a Capital names itself.
- Only a Capital declares `[skills.ki-repo.territory]`, which holds `name` and the sorted `members`, including itself.
- Only a Capital declares `[skills.ki-trades.territory]`. It holds a `subtypes` table, `[[channels]]` entries (`id`, `purpose`, `from`, `to`, `kinds`) and `[[standing]]` grants (`subtype`, `from`, `to`).

A member's `[skills.ki-trades]` may hold only `map_bonus`. `routes` and `subtypes` are retired and rejected.

Each repository resolves its declared Capital through the local registry. Resolution fails closed when the Capital is:

- unregistered, which reports `territory policy lives in <capital>, not available here`;
- registered more than once;
- invalid;
- not a Capital;
- not listing the repository.

A route is active when its peer is registered once, declares `[skills.ki-trades]` and resolves the same Capital. Several territories can coexist in one registry.

## Boundary

- One change to the target state, with no staged releases and no legacy parser.
- `ki/trade-routes/v1` output stays byte-compatible for apps-observatory.
- `TRD-8004751b` and `TRD-d03495e9` are never rewritten, and the policy must still grant the routes they depend on.
- This item does not cut or publish a release.

## Current state

The implementation, tests and documentation are complete in the item's worktree. Verification is under way against the real Arcadia Capital policy in an isolated `KI_*_HOME`.

## Steps

- [x] `configuration.ts` handles the declaration side:
  - parses `capital`, the two territory tables and the member `map_bonus`;
  - rejects the retired keys and territory tables outside a Capital;
  - validates channels and standing grants;
  - derives each repository's effective routes from the policy.
- [x] `estate.ts` handles resolution:
  - resolves the Capital through the registry and fails closed;
  - makes route activation depend on the peer sharing the Capital, replacing the reciprocal-declaration check.
- [x] `standing-intake.ts` makes a grant's state its knowledge route's state.
- [x] New `policy.ts` and `commands/trade/policy.ts` provide `policy show`, `policy check` and `policy compare --baseline`.
- [x] Remove the `routes add|remove`, `standing add|remove` and `subtypes` commands, together with `configuration-mutations.ts`.
- [x] `ki repo init` requires `--capital`. When the repository is its own Capital, it writes a one-member territory.
- [x] Update the tests, keeping 100% coverage.
- [x] Update the manual, the command inventory, the specs (TRADE-001, 003, 008 and 009 retired, 010, 012 to 014, REGISTRY-001 and 002), README, CHANGELOG and the guides.
- [ ] Verify against the Arcadia policy, then run review and acceptance.

## Files touched

- `src/core/trade/` (`policy.ts` new; `configuration.ts`, `estate.ts`, `standing-intake.ts` and `operations/routes.ts`; `configuration-mutations.ts` removed)
- `src/commands/trade/` (`policy.ts` new; `index.ts`, `routes/index.ts` and `standing.ts`; `subtypes.ts` removed)
- `src/core/configuration/declaration.ts` and `src/commands/repo/init.ts`
- `src/tests/`
- `man/ki.1` and `man/ki.commands.json`
- `docs/specs/trades.md`, `docs/specs/registry.md` and `docs/specs/index.md`
- `README.md` and `CHANGELOG.md`
- `docs/guides/user/getting-started.md`, `repository-operations.md` and `standing-knowledge-intake.md`

## Verify

- `bunx vitest run --coverage` (100%), `bunx tsc --noEmit -p .`, `bunx biome check`, knip, dependency-cruiser, the manual lint and the command-inventory check all pass.
- `ki repo audit --repo . --progress never --concise` passes with the locally built `ki` and harness.
- Isolated verification runs with every registered repository migrated:
  - `ki repo trade policy check`, run from Arcadia, reports no failing member;
  - `ki repo trade policy compare --baseline` against the v0.6.1 estate report loses no route and adds only `tools-techne -> homebrew-tap work`;
  - the standing grants match the previous active set;
  - the routes behind `TRD-8004751b` and `TRD-d03495e9` remain active.

## Dependencies / blocks

No local dependency. The cross-repository relationship is recorded under Discussion.

## Documentation impact

### Decision Records

None in this repository. The authority is decided in Arcadia, under KI-ARCADIA-GOV-016 and its GDR.

### Specifications

`docs/specs/trades.md` and `docs/specs/registry.md`. `docs/specs/index.md` gains the convention for retired requirements.

### Guides

The manual, README, CHANGELOG, and the getting-started, repository-operations and standing-knowledge-intake guides.

### Roadmap

None beyond this record.

## Discussion

### Cross-repository relationship

This item is blocked by `knowledgeislands/ki-arcadia-principal` `KI-ARCADIA-GOV-016`, which settles the policy authority and schema. It ships together with `knowledgeislands/ki-agentic-harness` `KI-HARNESS-GOV-122`, because the harness rubric parses routes independently.

### Release authority

The owner settled this on 2026-10-06: the coordinator cuts one release once verification passes. After that release, consumers bump their CI `KI_VERSION` from `v0.6.1`.
