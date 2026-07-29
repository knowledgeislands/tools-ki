---
id: KI-TOOL-CLI-002
title: Evaluate release-please for KI CLI releases
theme: cli
horizon: next
status: in-progress
blocks: []
blocked-by: []
baseline-ref: b99387b600abd0041e1253b2a09429a855b1e2db
---

## Context

Determine whether release-please can improve the CLI release boundary without weakening the manually dispatched signed, immutable release workflow.

## Boundary

This item does not make release-please a KI-wide standard, publish a release, or alter the signed-artifact publisher.

## Current state

The existing release workflow validates an exact tag, packages signed artifacts, publishes an immutable GitHub release, and proves a clean installation. A no-write `release-please@16.18.0 release-pr --dry-run` from `v0.2.11` proposed `v0.3.0` from accumulated 0.x history, conflicting with the deliberate V1-only changelog baseline. PR-only mode creates neither a GitHub Release nor a tag.

## Steps

1. ✓ Inventory the signed-release workflow, version/changelog records, installer evidence, and Homebrew handoff.
2. ✓ Design the only compatible release-please shape: manual release PR generation without release or tag creation.
3. ✓ Decline to retain a pre-V1 trial configuration because it would invite an invalid 0.x release PR.
4. ✓ Exercise the release-PR path in no-write mode and record its proposed version and notes.
5. ✓ Record the recommendation to defer release-please until after verified `v1.0.0`.

## Files touched

- `docs/guides/developer/release-management.md`
- `CHANGELOG.md`
- `.github/workflows/` only if a post-V1 trial is later approved

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. Confirm the existing signed-release workflow and clean-install verification remain intact.

## Dependencies / blocks

This item has no dependency or downstream block.
