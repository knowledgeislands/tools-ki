---
id: 'CLI-005'
title: Repair verified release-installer contract for CI
status: in-progress
roadmap: cli/repair-verified-release-installer-contract-for-ci
blocks: —
blocked-by: —
baseline-ref: —
transferred-from: knowledgeislands/ki-agentic-harness:FND-001
---

## Context

The harness plan [FND-001](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-001-verify-github-ci-across-fleet.md) requires every active Knowledge Islands repository to prove `ki` from a verified released installation on a clean hosted runner before its governance audit runs.

This plan repairs the `tools-ki` release and installer contract that currently prevents that proof.

## Current state

- `install.sh` verifies an Ed25519-signed checksum manifest, archive SHA-256, archive shape, and executable version before replacing an installed binary.
- The documented installation flow downloads only `install.sh`, but the script requires its adjacent `release/ki-release-signing-public.pem`; a caller cannot follow the documentation without discovering that additional file.
- The current GitHub release is published but GitHub reports it as mutable, and no explicit equivalent release-integrity contract or clean hosted Linux installation proof is recorded.
- Existing release packaging and validation are the correct security boundary; this work must close the distribution gap without weakening them.

## Steps

1. [x] Resolve the release-integrity decision: GitHub immutable releases are required. GitHub locks the published assets and their associated tag; the installer embeds its public trust anchor. Enabling the repository or organization setting remains an external prerequisite before the next release.
2. [x] Define one documented public acquisition path: download root `install.sh` from an exact immutable release tag, then run it with the same exact tag. It needs neither a checkout nor a separately discovered key.
3. [x] Implement the local installer, release workflow, and documentation contract while retaining Ed25519 manifest verification, checksum verification, archive-shape validation, executable-version validation, HTTPS-only retrieval, and atomic replacement/rollback.
4. [x] Add focused installer tests for the embedded anchor and a copied installer without a sibling `release/` directory, while retaining the existing unsigned, malformed, checksum, and rollback failure tests.
5. [ ] Execute the clean GitHub-hosted Linux proof added to the release workflow. It installs an exact released version into isolated paths, checks the executable and version, bootstraps the canonical harness, and inventories it. This requires immutable releases to be enabled and a new release because GitHub does not apply immutability retrospectively.
6. [ ] Publish the resulting immutable-release and clean-runner evidence to [FND-001](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-001-verify-github-ci-across-fleet.md), enabling its receiving-repository workflow rollout.

## Files touched

- `install.sh`
- `release/package.sh`, `release/ki-release-signing-public.pem`, and release-manifest or release-evidence files required by the chosen contract
- `.github/workflows/release.yml` and the focused hosted Linux release-install proof workflow or job
- `README.md` and `docs/guides/developer/local-development.md`
- `src/tests/install/**` and any focused CLI/install test support required to prove the published path
- `CHANGELOG.md`
- `docs/roadmap/cli/ROADMAP.md`
- `docs/roadmap/cli/plans/CLI-005-repair-verified-release-installer-contract.md`

## Verify

1. A clean temporary directory can follow the exact documented command for a pinned release and install `ki` without a checkout, package alias, vendored executable, or manually discovered verification input.
2. The installer rejects an altered manifest, signature, signing key, archive, archive shape, executable version, and non-HTTPS acquisition path without changing the previous installation.
3. The release publishes every declared verification input and demonstrates the selected immutable or explicitly verified equivalent integrity evidence.
4. A clean `ubuntu-latest` job installs the released Linux archive into a known directory, proves `command -v ki` equals that expected path, proves the pinned version, uses isolated `KI_*` state, runs noninteractive `ki bootstrap`, and inventories `knowledgeislands/ki-agentic-harness` before audit.
5. `bun run test`, `bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip`, `bash -n install.sh`, and `git diff --check` pass.

## Dependencies / blocks

This plan is the receiving-repository release-install prerequisite for `knowledgeislands/ki-agentic-harness:FND-001` and blocks that plan's fleet workflow rollout.

The source plan is recorded as `transferred-from` rather than a local `blocked-by` identifier because CLI roadmap dependencies resolve only plans in `tools-ki`.

GitHub immutable releases are an external release prerequisite, not a claim about `v0.2.6`: they apply only to future releases. Do not substitute a weaker integrity claim or fallback path.

## Delegation

- Round 1 — research: inspect GitHub release immutability controls, the current release workflow, installer trust inputs, and hosted-runner constraints; files: read-only release and GitHub configuration scope; gate: an accepted integrity mechanism and documented acquisition shape.
- Round 2 — mechanical: implement the chosen release/installer/documentation contract and its focused failure tests; files: exclusive `install.sh`, `release/**`, installer tests, and documentation paths; gate: local installer and release verification.
- Round 3 — mechanical: add and execute the hosted Linux release-install proof; files: exclusive workflow path; gate: an accepted green run with executable, bootstrap, and harness evidence.
- Orchestrator: adversarially review trust-anchor acquisition, every fail-closed branch, release evidence, and runner proof; run final verification and commit only gated work.
