---
id: 'CLI-006'
title: Deliver verified KI release installation
status: in-progress
roadmap: cli/deliver-verified-ki-release-installation
blocks: —
blocked-by: —
baseline-ref: 1ecb6e48e71346688c3d1734fe764e57df0be1e3
---

## Context

`tools-ki` owns the public `ki` executable and its release artifacts, but its current `install.sh` can only copy a locally built `dist/ki` or link a checkout-local `bin/ki` launcher.

The Website's `/harness/install` redirect still targets the harness installer, which is no longer the correct public owner.

The public installer must not download an unauthenticated or mutable artifact.

It needs a tag-bound release contract that lets a user select a supported target, verify an immutable archive, and install the executable and `ki(1)` atomically.

## Current state

- GitHub release `v0.1.0` has no binary assets.
- CI builds `dist/ki` only as ephemeral Actions artifacts, with no tag trigger, stable artifact names, checksums, signatures, or retention contract.
- The Homebrew formula installs the `v0.1` source archive and historical `bin/ki` launcher rather than a compiled release artifact.
- `install.sh --link` is a useful local-development path, but `--copy` cannot serve as public installation because it requires a populated checkout.

## Steps

1. ✓ Define the supported matrix: `darwin-arm64`, `darwin-x64`, and glibc `linux-x64`; each `ki-vX.Y.Z-<target>.tar.gz` contains only regular `ki` and `man/ki.1`; `ki-checksums.txt` is a sorted LF `ki-release-checksums-v1` manifest and `ki-checksums.txt.sig` is its Ed25519 signature.
2. ✓ Add the protected-default-branch manual release workflow: validate an exact `vX.Y.Z` tag, build the three tag-commit archives, sign and upload a draft release, download and reverify its assets, then publish it. The GitHub `release` environment must still be configured before the first real run.
3. ✓ Replace `install.sh`'s checkout-only default with target detection, exact-tag resolution, manifest-signature and archive-checksum verification, strict archive validation, staged version verification, and rollback-safe per-file replacement.
4. ✓ Retain `install.sh --link` exclusively for local checkout development, using a Bun launcher for `src/main.ts`. Keep `bin/ki` because the existing in-process CLI test seam still requires it; remove it only when that independent dependency ends.
5. ✓ Add end-to-end installer fixtures for target selection, latest-release resolution, unsigned/malformed/checksum-mismatched manifests, rollback with and without an existing installation, and the retained local `--link` path.
6. ✓ Align the in-repository README, `ki(1)`, local-development guide, and changelog with the verified release artifacts and development-only link path. The Homebrew tap update belongs to its external repository and waits for the first verified release asset.
7. Move the Website public install redirect to the tools-owned installer after a released artifact passes the end-to-end verification; retain an intentional compatibility redirect only if the Website plan approves it.

## Files touched

- `install.sh`, release workflow, installer tests, build/package configuration, and release documentation in `tools-ki`
- Homebrew formula and release-delivery configuration
- The KI Website redirect configuration in a separately committed recipient change

## Verify

1. Every supported release archive contains only the expected executable and manual, with stable names and manifest entries.
2. The installer rejects missing, unsigned, malformed, mismatched, redirected, and unsupported release inputs before changing an existing installation.
3. A successful public installation atomically replaces both `ki` and `ki(1)`, and `ki --version` reports the released version.
4. `install.sh --link` continues to follow a local checkout without requiring a release download.
5. The tools test suite, TypeScript check, formatter/linter, and installer integration tests pass.

## Dependencies / blocks

This plan is independently executable from the completed native repository-maintenance work, but must use the same canonical harness and CLI delivery vocabulary.

The Website redirect change is an outbound recipient task after this plan's first verified released artifact; it does not block release-workflow or installer implementation.

The protected GitHub `release` environment is required before the first publishing run: restrict it to the protected default branch, require independent approval without bypass, and store `KI_RELEASE_SIGNING_KEY` only as its environment secret. Its absence blocks the final publish proof and the Website/Homebrew recipient handoffs, not this local implementation.

The first publish proof for `v0.2.0` stopped during the `darwin-arm64` package test because the fixture tried to create an Ed25519 signature through an unsupported OpenSSL signing interface; no release was published. The subsequent `v0.2.1` through `v0.2.3` corrections also published nothing while isolating the difference between modern and Apple OpenSSL verification forms. Installer fixtures now use Node's standards-format Ed25519 signer, and the installer automatically uses `-rawin` when supported or the Apple-compatible form otherwise; the normal macOS installer test exercises that fallback. The corrected first release must use the next patch version, `v0.2.4`, because all prior tags remain immutable.

## Delegation

- Round 1 — research, `gpt-5.6-terra`: specify the release asset, checksum, signature, and installer-verification contract from the current repository and official GitHub evidence; files: read-only repository and primary sources; gate: orchestrator review before workflow or installer edits.
- Round 1 — research, `gpt-5.6-terra`: adversarially review the planned installer and release-workflow trust boundary, including key handling, redirects, archive paths, and atomic replacement; files: read-only repository and primary sources; gate: findings incorporated before auto-executing artefacts are authored.
- Round 2 — mechanical, `gpt-5.6-terra`: implement the settled installer, packaging, workflow, tests, and documentation in exclusive file scopes; gate: adversarial review of every script/workflow diff plus full integration verification.
- Orchestrator: resolves the release contract, assigns non-overlapping file boundaries, reviews every worker diff, performs the dedicated auto-execution safety pass, and commits only verified work.
