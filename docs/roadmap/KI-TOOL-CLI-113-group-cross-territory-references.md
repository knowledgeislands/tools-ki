---
id: KI-TOOL-CLI-113
area: CLI
title: Group cross-territory references
kind: deliver
purpose: capability
project: roadmap-model
component: repo
status: done
blocks: []
blocked_by: []
baseline_ref: 8b54eb97ee6c3ae925c13446f2a568eced56403d
created_at: 2026-10-07T15:03:28Z
updated_at: 2026-10-07T15:16:02Z
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

- [x] Accept `<territory>/<slug>` for `project` and `initiative` in work-item parsing.
- [x] Add territory registry resolution through the local registry, requiring a checkout that declares itself a Capital, and a reference parser.
- [x] Group qualified references against their territory's registry, deriving a qualified Initiative from a qualified Project, with one warning per unavailable territory.
- [x] Prove the migration helper preserves qualified values.
- [x] Run the full suite at full coverage, the type check, lint and focused audits, and write the review packet.

## Files touched

- `src/core/work/items.ts`
- `src/core/work/registry.ts`
- `src/core/work/operations.ts`
- `src/commands/repo/roadmap.ts`
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

## Review

### Delivered

`ki repo roadmap list --by project|initiative` now groups a territory-qualified `project` or `initiative` (`<territory>/<slug>`) against that territory's Capital registry, resolved through the local `ki` registry, and `ki repo roadmap migrate` reads and preserves qualified values. Unqualified slugs keep meaning the repository's own Capital territory, and an unavailable territory warns once without changing the exit status. Excluded: any new registry field or alias, and the chezmoi value rewrite. Baseline `8b54eb97ee6c3ae925c13446f2a568eced56403d`.

### Change Summary

- `src/core/work/items.ts`: `project` and `initiative` accept `<territory>/<slug>`; new `parseRegistryReference`; `component` stays a bare slug.
- `src/core/work/registry.ts`: the registry reader is split from Capital discovery; new `loadTerritoryRegistry` resolves a local-registry key to a checkout that declares itself a Capital; `workItemGroup` resolves each reference in its own territory, derives a qualified Initiative from a qualified Project, keeps the qualifier when the territory registry is unavailable, and names the group in a contradiction warning.
- `src/core/work/operations.ts`: grouping loads the own registry and each referenced territory once, collecting one warning per unavailable registry (`registryWarnings`). The own-registry warning appears only when a record uses an unqualified slug, matching the harness checker.
- `src/commands/repo/roadmap.ts`: prints every grouping warning.
- `src/tests/cli/repo/roadmap-model.test.ts`: invalid over-qualified and qualified-component values, qualified values preserved by migration, and grouping across resolvable, missing, non-Capital and invalid territory registries.

### Verification

- `bun run test:coverage`: 65 files, 1076 tests pass, full coverage thresholds met.
- `bunx tsc --noEmit`: clean.
- `bunx biome check` on touched sources and tests: no findings.
- `ki repo audit --skill ki-work-roadmap`: PASS.
- `ki repo --repo chezmoi roadmap list --by project` and `--by initiative`, from source after chezmoi's values were qualified: every record groups under `ki-arcadia-principal/<slug>`, with no registry warning.

### Outstanding concerns

None in this repository. Chezmoi's value rewrite is its own migration under the same rollout.

### Post-change review

The goal is met and matches the harness checker from KI-HARNESS-GOV-153: same syntax, same Capital-key rule, warnings only. Existing bare slugs group exactly as before. Regression risk is low and confined to `--by` grouping output.

### Mini recap

Qualified references now group in their own territory, with warnings when that territory cannot be read. Gates pass at full coverage.

## Done

Accepted 2026-10-07 by Kris Brown on the review packet above.

## Discussion

### Authority

Decision 9 (Kris Brown, 7 October 2026) approves the change, and decision 6 grants carry-through to done for the whole rollout, including fast-forward pushes of the commits it makes. That is the adoption, readiness and acceptance authority for this record. Closed through `ki-accept` under that grant after rechecking the review evidence on the committed delivery (`8963e44` and `00a37a8`): `bun run test:coverage` 1076 pass at full coverage, `bunx tsc --noEmit` clean, and `ki repo audit --skill ki-work-roadmap` PASS.
