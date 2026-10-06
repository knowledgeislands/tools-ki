---
id: KI-TOOL-CLI-104
area: CLI
title: Capital trade policy
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: 3f96f18680c8792a837ecba1931e03ab59112741
created_at: 2026-10-06T10:00:00Z
updated_at: 2026-10-06T18:30:00Z
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

- [x] `configuration.ts` parses `capital`, the two territory tables and the member `map_bonus`, rejects the retired keys and territory tables outside a Capital, validates channels and standing grants, and derives each repository's effective routes from the policy.
- [x] `estate.ts` resolves the Capital through the registry and fails closed, and makes route activation depend on the peer sharing the Capital, replacing the reciprocal-declaration check.
- [x] `standing-intake.ts` makes a grant's state its knowledge route's state.
- [x] New `policy.ts` and `commands/trade/policy.ts` provide `policy show`, `policy check` and `policy compare --baseline`.
- [x] Remove the `routes add|remove`, `standing add|remove` and `subtypes` commands, together with `configuration-mutations.ts`.
- [x] `ki repo init` requires `--capital`. When the repository is its own Capital, it writes a one-member territory.
- [x] Update the tests, keeping 100% coverage.
- [x] Update the manual, the command inventory, the specs (TRADE-001, 003, 008 and 009 deprecated, 010, 012 to 014, REGISTRY-001 and 002), README, CHANGELOG and the guides.
- [x] Verify against the Arcadia policy and the saved v0.6.1 route report.

## Files touched

- `src/core/trade/` (`policy.ts` new; `configuration.ts`, `estate.ts`, `model.ts`, `standing-intake.ts` and `operations/routes.ts`; `configuration-mutations.ts` removed)
- `src/commands/trade/` (`policy.ts` new; `index.ts`, `routes/index.ts`, `standing.ts`, `records.ts`, `selection.ts` and `shared.ts`; `subtypes.ts` removed)
- `src/core/configuration/declaration.ts`, `src/core/configuration/index.ts` and `src/commands/repo/init.ts`
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

## Review

### Delivered

`ki` resolves every repository's trade routes and standing grants from its declared Capital through the registry, and fails closed when the Capital is unavailable, ambiguous, invalid, not a Capital or does not list the member. Member route and subtype keys are retired and rejected, and their mutators are removed. `ki repo init --capital` is required. `ki repo trade policy show|check|compare` are the read-only policy commands. The `ki/trade-routes/v1` JSON contract is unchanged.

### Change Summary

- `feat(trade)!` Capital policy resolution, retirement of member routes and mutators, `policy` commands and `init --capital`; `chore(config)` this repository's Capital; `docs(specs)` TRADE-008 and TRADE-009 deprecated.
- Review fixes: `fix(trade)` requires Capital `members` in code-point order, names members skipped because their Capital is unavailable (`skipped:` lines and `SKIPPED=n`; stderr under `--format json`), and rejects a malformed `policy compare` baseline route; one shared `isRecord`. `docs(trade)` covers the skip report, the ordering rule and the whole-registry sweep of `policy compare` in the manual, README, specs and getting-started guide. `docs(changelog)` records the final behaviour.

### Verification

Run on `feat/cli-104-capital-trade-policy` with this branch's `src/main.ts` as `ki` and the `KI-HARNESS-GOV-122` harness (now on harness `main`), in an isolated `KI_*_HOME` registering all 41 repositories at their pushed Capital declarations.

- `bun run test:coverage`: 64 files, 1062 tests, 100% statements, branches, functions and lines. `bunx tsc --noEmit -p .`, `bunx knip`, dependency-cruiser, `mandoc -T lint man/ki.1`, Biome on changed files, rumdl and command-inventory regeneration are clean.
- `ki repo trade policy check` from Arcadia: MEMBERS=21 CONFORMING=21 WARNING=0 FAILING=0 UNVERIFIABLE=0. All seven Capitals list their members in code-point order.
- `ki repo trade policy compare --baseline` against the saved v0.6.1 estate report: COVERED=77 LOST=0 ADDED=1, the addition being `tools-techne -> homebrew-tap work`.
- `ki repo trade standing list`: GRANTS=21 ACTIVE=21 in `ki-agentic-harness`, 4 in `ki-website`, and 3 each in `ki-techne-harness` and `tools-techne`.
- `TRD-8004751b` and `TRD-d03495e9` remain visible in `tools-ki` as awaiting receipt on active routes.
- `ki repo audit --repo . --progress never --concise`: no territory, trade or roadmap finding; the only failure is SELECT-1 auto-memory, an artefact of the isolated `HOME`.

### Outstanding concerns

- CI installs released `ki` v0.6.1, which does not know `capital`, so audits across the estate fail until this is released and each CI `KI_VERSION` pin is bumped; the owner accepted that window.
- Five abbreviated `_Verify:_` names in `docs/specs/trades.md` predate this work and do not resolve to test names.
- Unfiltered `ki repo --estate trade list` still fails on repositories that do not declare `ki-trades`, as before this change.

### Post-change review

A Fable review approved with should-fixes and no blockers. Its three should-fixes (unvalidated `members` order, silent skipping of members with an unavailable Capital in aggregate views, coercion of a malformed comparison baseline) and its nits (duplicate `isRecord`, double parsing, undocumented whole-registry sweep, `replace` versus `replaceAll`, a stale reciprocal-declaration comment) are addressed. Its note that a member-side trade operation exits 2 rather than warning when the Capital is unavailable follows the specification: audits warn, trade operations fail closed.

### Mini recap

Trade authority now comes from one place, the Capital's policy, and `ki` proves the switched estate keeps every previous route plus the one decided addition. Ready for release by the coordinator.

## Done

Accepted 2026-10-06 by Kris Brown on the review packet above.

## Discussion

### Cross-repository relationship

This item is blocked by `knowledgeislands/ki-arcadia-principal` `KI-ARCADIA-GOV-016`, which settles the policy authority and schema. It ships together with `knowledgeislands/ki-agentic-harness` `KI-HARNESS-GOV-122`, because the harness rubric parses routes independently.

### Release authority

The owner settled this on 2026-10-06: the coordinator cuts one release once verification passes. After that release, consumers bump their CI `KI_VERSION` from `v0.6.1`.
