---
id: KI-TOOL-CLI-068
area: CLI
title: Split Harness storage lifecycles
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: 5628ddbf0b9f6ce9ac30889761f7528c0a86f9cd
created_at: 2026-09-14T14:04:03Z
updated_at: 2026-09-14T18:02:46Z
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

- [x] Isolate immutable release-registry configuration parsing and installed-ID mutation in the existing registry module.
- [x] Move verified archive installation, replacement, restoration, and uninstall into an installation lifecycle module.
- [x] Move interrupted-install planning and recovery into a recovery module.
- [x] Move local development projection inspection, enablement, and state queries into a development module.
- [x] Keep only stable shared storage concepts shared, update the storage barrel, and remove obsolete cross-concern imports.
- [x] Prove every observable path through focused Harness, development, repair, and diagnostic CLI tests, then run full coverage and repository gates.

## Files touched

- `src/core/storage/registry.ts`
- New focused modules under `src/core/storage/` for shared Harness storage concepts, installation, recovery, and development projection
- `src/core/storage/index.ts`
- Repository-local `ki-self` rubric source and generated publication for the moved bootstrap guard
- Canonically conformed `+/README.md` and `-/README.md` working-area orientations required by the current repository audit
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

## Review

### Delivered

Split Harness storage responsibilities from the immutable baseline `5628ddbf0b9f6ce9ac30889761f7528c0a86f9cd` while preserving the existing storage barrel and every CLI-visible behaviour. Registry configuration, archive installation and removal, interrupted-install recovery, local development projection, and shared path contracts now have focused modules.

### Summary of changes

Reduced `src/core/storage/registry.ts` from 572 to 186 lines. Added `harness-installation.ts` at 206 lines, `harness-development.ts` at 141 lines, `harness-recovery.ts` at 44 lines, and `harness-paths.ts` at 28 lines. Updated `ki-self` to locate the canonical bootstrap inventory consumer at its new installation owner. The full audit also mechanically refreshed both working-area README orientations to the current Harness standard.

### Verification

- Focused Harness, development, repair, and diagnostic CLI suite — 162 tests passed.
- `bun run test:coverage` — passed with 100% statements, branches, functions, and lines.
- `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, and `bun run build` — passed.
- `ki repo audit --skill ki-self --repo .` and `ki repo audit --skill ki-engineering --repo .` — passed.
- `ki repo audit --repo .` — passed all 18 selected skills.

### Outstanding concerns

None. Knip retains its existing informational configuration hint for the intentionally ignored managed `.claude/skills/**` surface; it is not a source or dependency finding.

### Post-change review

The split follows lifecycle ownership rather than arbitrary file length. Installation depends on registry configuration and the development-link query, while commands continue to depend only on the storage barrel. No command port, exported barrel name, transaction guard, configuration shape, filesystem shape, or fault-injection seam changed.

### Mini recap

The pre-existing mixed-responsibility storage boundary is resolved without adding internal unit tests or compatibility shims. Existing CLI contract tests provide complete behavioural evidence, and no further modularity follow-up is required.

## Done

Accepted 2026-09-14 under the user-approved BATCH-005 consolidated completion authority after rechecking the committed review packet and full repository audit.

## Discussion

Split around stable lifecycle ownership rather than file length alone: release registry configuration, installation/replacement, recovery, and development projection should each have an explicit home and narrow internal interface. Keep the existing CLI-driven contract tests as the verification boundary and avoid new internal unit tests that would ossify the refactor.
