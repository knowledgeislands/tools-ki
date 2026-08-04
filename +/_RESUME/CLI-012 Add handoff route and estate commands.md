---
type: admin-resume-checkpoint
title: 'CLI-012 Add typed trade route and estate commands'
thread: 'CLI-012 Add typed trade route and estate commands'
created: 2026-08-03T11:20:00Z
updated: 2026-08-04T01:45:00Z
---

# CLI-012 Add typed trade route and estate commands

## Objective

Deliver the `ki trades` command group for safe, typed, directional cross-repository work and knowledge submissions, without allowing a repository to write a peer's state or decide its work, knowledge, priority, or acceptance.

## Current state

The typed-trades implementation is committed:

- `228f0e2` — `feat: replace handoffs with typed trades`
- `1936c76` — `docs: prepare typed trades for acceptance`

It provides `ki trades routes add|remove|list|check`, plus `new`, `receive`, `list`, `show`, `release`, and `prune`. The commands use the registered repository estate as read-only peer evidence, mutate only the current repository, use `ki-repo.repository` canonical HTTPS GitHub homes, and enforce typed reciprocal routes. Each `HND-` UUID record requires `kind: work|knowledge`; work uses `adopted` with `adopted_as`, knowledge uses `retained` with `retained_as`, and either terminal disposition permits sender release and receiver pruning.

The work item `KI-TOOL-CLI-012` is at `acceptance`. Its last recorded full gate passed 476 tests with 100% statements, branches, functions, and lines; this checkpoint requires a fresh post-migration verification before it can be used as acceptance evidence.

## Read first

- `docs/roadmap/KI-TOOL-CLI-012-add-handoff-route-and-estate-commands.md` — lifecycle, scope, and acceptance boundary.
- `src/core/trade-core.ts` — record parsing, local-only mutation, typed route checks, and lifecycle enforcement.
- `src/tests/cli/trade-command.test.ts` — sandbox-driven public CLI contract coverage.
- Harness commit `c463ec35` — published portable typed-trade contract to reconcile before acceptance.
- Harness `skills/governance/ki-handoffs/references/standards-handoffs.md` — route, record, and lifecycle contract.

## Next step

Use only CLI-driven sandbox tests to preserve the legacy coverage while validating the typed route and lifecycle contract. Do not weaken the 100% coverage threshold or add `v8 ignore` for a reachable input. Then rerun `bun run test:coverage`, `bunx tsc --noEmit`, and the formatting, documentation, manual, and relevant governance audit gates.

When the gates are clean, reconcile the resulting command behavior with Harness commit `c463ec35`, update the local CLI-012 acceptance packet, and stop for explicit acceptance. Do not write a peer repository.

## Boundaries

- Do not write a peer repository's configuration, trade record, or roadmap.
- Do not infer acceptance from silence or a missing peer record.
- Do not implement remote interchange transport.
- Do not touch the unrelated ecosystem decision work.
