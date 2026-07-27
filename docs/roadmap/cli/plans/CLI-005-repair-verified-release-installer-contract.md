---
id: 'CLI-005'
title: Repair verified release-installer contract for CI
status: open
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

1. Resolve the release-integrity decision: determine whether immutable GitHub releases can be guaranteed by repository settings and release design; if they cannot, define and record an explicitly verified equivalent that protects the installer, signing key, manifest, archive, version, and release identity.
2. Define one documented public acquisition path that obtains every installer verification input, including the pinned public key, without an undocumented side download or a checkout dependency.
3. Implement the selected release packaging, installer, and documentation contract while retaining Ed25519 manifest verification, checksum verification, archive-shape validation, executable-version validation, HTTPS-only retrieval, and atomic replacement/rollback.
4. Add focused installer and release tests that fail closed for absent, substituted, malformed, or unverifiable verification inputs and prove that the documented command works from an empty temporary directory.
5. Add a clean GitHub-hosted Linux runner proof that installs an exact released version into an isolated path, asserts the expected executable and `ki --version`, uses isolated KI state, bootstraps the canonical harness, and proves the harness inventory before repository audit.
6. Publish the resolved release evidence and clean-runner result to [FND-001](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-001-verify-github-ci-across-fleet.md), enabling its receiving-repository workflow rollout.

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

The release-immutability mechanism is intentionally an explicit decision step: do not assume GitHub settings alone are sufficient or silently substitute a weaker integrity claim.

## Delegation

- Round 1 — research: inspect GitHub release immutability controls, the current release workflow, installer trust inputs, and hosted-runner constraints; files: read-only release and GitHub configuration scope; gate: an accepted integrity mechanism and documented acquisition shape.
- Round 2 — mechanical: implement the chosen release/installer/documentation contract and its focused failure tests; files: exclusive `install.sh`, `release/**`, installer tests, and documentation paths; gate: local installer and release verification.
- Round 3 — mechanical: add and execute the hosted Linux release-install proof; files: exclusive workflow path; gate: an accepted green run with executable, bootstrap, and harness evidence.
- Orchestrator: adversarially review trust-anchor acquisition, every fail-closed branch, release evidence, and runner proof; run final verification and commit only gated work.
