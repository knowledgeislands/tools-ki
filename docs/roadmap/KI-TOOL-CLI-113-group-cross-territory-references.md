---
id: KI-TOOL-CLI-113
area: CLI
title: Group cross-territory references
kind: deliver
purpose: capability
project: roadmap-model
component: repo
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-07T15:03:28Z
updated_at: 2026-10-07T15:03:28Z
---

# KI-TOOL-CLI-113: Group cross-territory references

## Goal

`ki repo roadmap list --by project|initiative` resolves a territory-qualified `project` or `initiative`, and `ki repo roadmap migrate` reads and preserves such values, matching the harness standard.

## Context

[KI-HARNESS-GOV-153](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-153-qualify-cross-territory-references.md) lets a record name another territory's Project or Initiative as `<territory>/<slug>`, where `<territory>` is the local `ki` registry key of that territory's Capital, for example `ki-arcadia-principal/agent-host`. Unqualified slugs keep meaning the repository's own Capital territory, and an unresolvable reference warns without failing. Kris approved the change on 7 October 2026 (decision 9 of the roadmap-model run).

## Boundary

- Work-item parsing, Project registry resolution, `--by` grouping, the migration helper and their tests only.
- Warnings stay warnings: grouping never changes the exit status.
- No new registry field, no remote lookup, and no change to the harness checker.

## Current state

- `src/core/work/items.ts` rejects any `project` or `initiative` value that is not a bare kebab-case slug, so a qualified record cannot be listed or migrated.
- `src/core/work/registry.ts` loads only the repository's own Capital registry, and `workItemGroup` checks every slug against it.
- `src/core/work/migration.ts` copies unrelated frontmatter lines verbatim, but runs only on records that parse.

## Steps

- [ ] Accept `<territory>/<slug>` for `project` and `initiative` in work-item parsing.
- [ ] Add territory registry resolution through the local registry, requiring a checkout that declares itself a Capital, and a reference parser.
- [ ] Group qualified references against their territory's registry, deriving a qualified Initiative from a qualified Project, with one warning per unavailable territory.
- [ ] Prove the migration helper preserves qualified values.
- [ ] Run the full suite at full coverage, the type check, lint and focused audits, and write the review packet.

## Files touched

- `src/core/work/items.ts`
- `src/core/work/registry.ts`
- `src/core/work/operations.ts`
- `src/tests/cli/repo/roadmap-model.test.ts`

## Verify

- `bun run test:coverage` passes at the configured full-coverage thresholds.
- `bunx tsc --noEmit` is clean and `bunx biome check` passes on touched files.
- `ki repo audit --skill ki-work-roadmap` reports FAIL=0.
- `ki repo --repo chezmoi roadmap list --by project` groups qualified chezmoi records without registry warnings once chezmoi is migrated.

## Dependencies / blocks

KI-HARNESS-GOV-153 is done and pushed in `ki-agentic-harness`.

## Documentation impact

### Decision Records

None.

### Specifications

None: the harness registry standard owns the syntax.

### Guides

None: `ki repo roadmap list --by` help text is unchanged.

### Roadmap

None.

## Discussion

### Authority

Decision 9 (Kris Brown, 7 October 2026) approves the change, and decision 6 grants carry-through to done for the whole rollout, including fast-forward pushes of the commits it makes. That is the adoption, readiness and acceptance authority for this record.
