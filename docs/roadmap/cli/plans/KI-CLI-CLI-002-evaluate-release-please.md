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

`.github/workflows/release.yml` validates a requested version, packages signed artifacts, publishes an immutable GitHub release, and verifies a clean installation. The repository maintains release-management guidance and a changelog, but has not trialled release-please's release-PR and Conventional Commit model against that workflow.

## Steps

1. Inventory the existing release workflow, version/changelog records, installer evidence, and Homebrew handoff points as the comparison baseline.
2. Design a reversible release-please trial that preserves the signed-artifact workflow, direct-main practice, and release-environment controls.
3. Add the minimum trial configuration and workflow wiring, without making release-please the only release route or changing the `ki-tools` standard.
4. Exercise the proposed release-PR path against representative Conventional Commit history and verify that versioning, notes, tags, artifacts, installer evidence, and Homebrew follow-up remain explicit.
5. Record the evidence-based recommendation to adopt, revise, or remove the trial and update release guidance accordingly.

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
