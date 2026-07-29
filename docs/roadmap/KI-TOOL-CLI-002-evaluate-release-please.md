---
id: KI-TOOL-CLI-002
title: Evaluate release-please for KI CLI releases
theme: cli
horizon: next
status: done
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

- `docs/developer/release-management.md`
- `CHANGELOG.md`
- `.github/workflows/` only if a post-V1 trial is later approved

## Verify

1. `bun run test`
2. `bun run test:coverage`
3. `./bin/ki repo audit --repo .`
4. Confirm the existing signed-release workflow and clean-install verification remain intact.

## Dependencies / blocks

This item has no dependency or downstream block.

## Acceptance

### Delivered

- Assessed release-please in no-write, PR-only mode against the existing release workflow.
- Recorded the incompatible pre-V1 result and the decision to defer release-please until after verified `v1.0.0`.
- Retained the manually dispatched signed, immutable release and clean-install verification boundaries.

### Summary of changes

The assessment and deferral are recorded in `docs/developer/release-management.md` and `CHANGELOG.md`. No workflow, publisher, tag, or release configuration changed.

### Verification

- `bun run test` — 24 test files and 378 tests passed.
- `bun run test:coverage` — 24 test files and 378 tests passed; statements, branches, functions, and lines each reached 100% coverage.
- `./bin/ki repo audit --repo .` — passed with no FAIL or WARN findings.
- `.github/workflows/release.yml` retains signed-manifest publication, immutable-release validation, and exact immutable-release installation and bootstrap verification.

Verification was re-run at `4668429b42d75403fdd2f35e5c5050c7f93b2bb0`.

### Outstanding concerns

Re-evaluate release-please only after a verified `v1.0.0` release, and only as a manually dispatched, PR-only version and changelog workflow that leaves the existing release path intact.

### Mini recap

The current release-please output is incompatible with the V1-only changelog baseline and cannot replace the signed release workflow. The re-evaluation condition is explicit rather than a standing implementation commitment.

## Done

Accepted by the user on 2026-07-29. The release-please evaluation is complete; re-evaluate only after a verified `v1.0.0` release. No residual concern is present in the current release workflow.
