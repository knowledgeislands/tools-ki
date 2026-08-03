---
type: admin-resume-checkpoint
title: 'CLI-012 Add handoff route and estate commands'
thread: 'CLI-012 Add handoff route and estate commands'
created: 2026-08-03T11:20:00Z
updated: 2026-08-03T11:20:00Z
---

# CLI-012 Add handoff route and estate commands

## Objective

Deliver and accept the `ki handoffs` command group for safe, reciprocal cross-repository work submissions, without allowing a repository to write a peer's state or decide its work.

## Current state

The executable implementation is committed:

- `097e7a2` — `feat: add reciprocal handoff commands`
- `2a035e1` — `test: expand handoff CLI contract coverage`

It provides `ki handoffs routes add|remove|list|check`, plus `new`, `receive`, `list`, `show`, `release`, and `prune`. The commands use the registered repository estate as read-only peer evidence, mutate only the current repository, use canonical `owner/repo` identities and `HND-` UUID records, and enforce reciprocal routes and terminal receiver dispositions before release or pruning.

The work item `KI-TOOL-CLI-012` remains `in-progress`. `bun run test` passes 465 tests; TypeScript, Biome, markdownlint, mandoc, and diff checks pass. The required coverage gate is the remaining blocker: `bun run test:coverage` reports 100% lines and functions, but 98.94% statements and 97.6% branches in malformed-input defensive paths in `src/core/handoffs.ts` and `src/commands/handoffs.ts`.

## Read first

- `docs/roadmap/KI-TOOL-CLI-012-add-handoff-route-and-estate-commands.md` — lifecycle, scope, and acceptance boundary.
- `src/core/handoffs.ts` — record parsing, local-only mutation, and the remaining coverage surface.
- `src/tests/cli/handoffs.test.ts` — existing sandbox-driven contract cases; extend this rather than unit-testing internals.
- Harness `docs/decisions/GDR-KI-HARNESS-005-cross-repository-handoff-submissions.md` — published portable contract to reconcile before acceptance.
- Harness `skills/governance/ki-handoffs/references/standards-handoffs.md` — route, record, and lifecycle contract.

## Next step

Use only CLI-driven sandbox tests to cover every reachable malformed-input branch in the handoff command/core modules. Do not weaken the 100% coverage threshold or add `v8 ignore` for a reachable input. Then rerun `bun run test:coverage`, `bunx tsc --noEmit`, and the formatting/documentation gates.

When coverage is clean, reconcile the resulting command behavior with the published Harness contract, record the direct-super-trust evidence in the Harness FND-009 item, complete the CLI-012 acceptance packet, and stop for explicit acceptance.

## Boundaries

- Do not write a peer repository's configuration, handoff file, or roadmap.
- Do not infer acceptance from silence or a missing peer record.
- Do not implement remote interchange transport.
- Do not touch the unrelated ecosystem decision work.
