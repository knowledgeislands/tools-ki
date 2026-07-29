---
id: 'KI-CLI-CLI-002'
title: Evaluate release-please for KI CLI releases
status: in-progress
roadmap: cli/evaluate-release-please-for-ki-cli-releases
blocks: —
blocked-by: —
baseline-ref: b99387b600abd0041e1253b2a09429a855b1e2db
---

## Context

The CLI currently uses a manually dispatched signed-release workflow, direct-main commits, release assets, an installer, and a later Homebrew-tap update. This evaluation determines whether release-please can improve the release boundary without becoming a required KI-wide workflow before it is proven in this repository.

## Current state

`.github/workflows/release.yml` validates a requested tag, packages signed artifacts, publishes an immutable GitHub release, and verifies a clean installation. A no-write `release-please@16.18.0 release-pr --dry-run` against the published `v0.2.11` baseline proposed a `v0.3.0` release PR from the accumulated 0.x history. That output conflicts with the deliberate V1-only changelog baseline. Release-please's PR-only mode neither publishes a GitHub Release nor creates a tag, so it does not replace the existing signed release gate. The evidence-based recommendation is to defer any retained configuration until after the verified `v1.0.0` release.

## Steps

1. ✓ Inventory the existing release workflow, version/changelog records, installer evidence, and Homebrew handoff points as the comparison baseline.
2. ✓ Design the only compatible trial shape: manual dispatch, release-PR only, and no release or tag creation; retain the existing signing and release-environment boundary.
3. ✓ Do not retain trial configuration before V1: a working workflow would invite an invalid 0.x release PR and cannot improve the V1 baseline.
4. ✓ Exercise the release-PR path through `release-please@16.18.0`'s no-write CLI mode. It proposed `v0.3.0` from 39 commits after `v0.2.11`, confirmed no tag or artifact action, and exposed the changelog conflict.
5. ✓ Record the recommendation to defer release-please until after the verified `v1.0.0` release; release-management guidance now states the rationale and the preservation conditions for any future trial.

## Files touched

- `.github/workflows/` and any release-please configuration files
- `docs/guides/developer/release-management.md`
- `CHANGELOG.md` only if the trial establishes a new maintained release record
- Tests or fixtures needed to verify repository-owned release configuration

## Verify

1. Validate the release-please configuration with its supported dry-run or GitHub Action path.
2. `bun run test`
3. `bun run test:coverage`
4. `./bin/ki repo audit --repo .`
5. Confirm the existing signed-release workflow and clean-install verification remain intact.

## Dependencies / blocks

No plan-level dependency blocks this evaluation. The Homebrew tap remains a downstream release follow-up owned by its repository and is not changed by this trial.
