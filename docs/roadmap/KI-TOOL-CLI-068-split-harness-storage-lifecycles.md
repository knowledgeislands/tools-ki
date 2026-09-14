---
id: KI-TOOL-CLI-068
area: CLI
title: Split Harness storage lifecycles
theme: cli
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 5628ddbf0b9f6ce9ac30889761f7528c0a86f9cd
created_at: 2026-09-14T14:04:03Z
updated_at: 2026-09-14T17:41:21Z
---

# Split Harness Storage Lifecycles

## Goal

Restore comprehension-first modularity by separating Harness registry configuration from installation transactions, interrupted-install recovery, development projection, restoration, and uninstall lifecycles.

## Context

The 2026-09-14 engineering review found `src/core/storage/registry.ts` at 572 lines with multiple independent callers and reasons to change. Its public surface currently combines release registry parsing and mutation with archive installation, orphan recovery, local development linking, restore, and removal operations. The registered mechanical engineering audit, 100% contract coverage, TypeScript, Biome, Knip, and build gates all pass, so this is a maintainability boundary gap rather than an observed behavioural defect.

## Boundary

Preserve every public CLI contract, fault-injection seam, transactional guard, recovery behaviour, barrel export, and test outcome. Do not change Harness lifecycle semantics, release metadata, configuration format, or installed filesystem shape merely to perform the split.

## Current state

`src/core/storage/registry.ts` owns six independently changing concerns and is the largest non-test module outside Agora resolution. All callers consume its exports through `src/core/storage/index.ts`, so the storage barrel is the stable internal boundary and the implementation can be split without changing command ports.

## Steps

- [ ] Isolate immutable release-registry configuration parsing and installed-ID mutation in the existing registry module.
- [ ] Move verified archive installation, replacement, restoration, and uninstall into an installation lifecycle module.
- [ ] Move interrupted-install planning and recovery into a recovery module.
- [ ] Move local development projection inspection, enablement, and state queries into a development module.
- [ ] Keep only stable shared storage concepts shared, update the storage barrel, and remove obsolete cross-concern imports.
- [ ] Prove every observable path through focused Harness, development, repair, and diagnostic CLI tests, then run full coverage and repository gates.

## Files touched

- `src/core/storage/registry.ts`
- New focused modules under `src/core/storage/` for shared Harness storage concepts, installation, recovery, and development projection
- `src/core/storage/index.ts`
- Existing CLI contract tests only if a public-boundary coverage gap is exposed
- This roadmap record and the active batch authorisation

## Verify

- Focused Harness installation, local-development, repair, and diagnostic CLI tests
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `bunx biome check .`
- `bunx knip`
- `bun run build`
- `ki repo audit --skill ki-engineering --repo .`
- `ki repo audit --repo .`

## Dependencies / blocks

No external dependency. Preserve current command-port exports through the storage barrel and do not touch Harness contract files or other repositories.

## Documentation impact

### Decision Records

No change: this applies the existing comprehension-first modularity standard.

### Specifications

No public behaviour changes, so no specification change is expected.

### Guides

No user workflow changes, so no guide change is expected.

### Roadmap

Record the exact module split, verification evidence, and any residual concern in this item.

## Discussion

Split around stable lifecycle ownership rather than file length alone: release registry configuration, installation/replacement, recovery, and development projection should each have an explicit home and narrow internal interface. Keep the existing CLI-driven contract tests as the verification boundary and avoid new internal unit tests that would ossify the refactor.
