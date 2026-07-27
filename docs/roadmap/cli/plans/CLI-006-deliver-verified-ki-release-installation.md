---
id: 'CLI-006'
title: Deliver verified KI release installation
status: acceptance
roadmap: cli/deliver-verified-ki-release-installation
blocks: —
blocked-by: —
baseline-ref: 1ecb6e48e71346688c3d1734fe764e57df0be1e3
---

## Context

`tools-ki` owns the public `ki` executable and its release artifacts, but its current `install.sh` can only copy a locally built `dist/ki` or link a checkout-local `bin/ki` launcher.

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
6. ✓ Align the in-repository README, `ki(1)`, local-development guide, and changelog with the verified release artifacts and development-only link path.
7. ✓ Align the release workflow comments with the solo-maintainer baseline and update all pinned GitHub Actions to their Node 24 runtime releases.

## Files touched

- `install.sh`, release workflow, installer tests, build/package configuration, and release documentation in `tools-ki`

## Verify

1. Every supported release archive contains only the expected executable and manual, with stable names and manifest entries.
2. The installer rejects missing, unsigned, malformed, mismatched, redirected, and unsupported release inputs before changing an existing installation.
3. A successful public installation atomically replaces both `ki` and `ki(1)`, and `ki --version` reports the released version.
4. `install.sh --link` continues to follow a local checkout without requiring a release download.
5. The tools test suite, TypeScript check, formatter/linter, and installer integration tests pass.

## Dependencies / blocks

This plan is independently executable from the completed native repository-maintenance work, but must use the same canonical harness and CLI delivery vocabulary.

The protected GitHub `release` environment is required before the first publishing run: restrict it to the protected default branch, require independent approval without bypass, and store `KI_RELEASE_SIGNING_KEY` only as its environment secret. Its absence blocks the final publish proof, not this local implementation.

The Website redirect is now recipient-owned as `knowledgeislands/ki-website` SITE-002 and waits for that publish proof. Aligning the Homebrew formula to the verified artifacts is also separate recipient work after the same evidence; neither belongs to this plan's files or completion gate.

The first publish proof for `v0.2.0` stopped during the `darwin-arm64` package test because the fixture tried to create an Ed25519 signature through an unsupported OpenSSL signing interface; no release was published. The subsequent `v0.2.1` through `v0.2.4` corrections also published nothing while isolating the difference between modern and Apple OpenSSL capabilities. Installer fixtures now use Node's standards-format Ed25519 signer, and the installer automatically selects Homebrew's OpenSSL 3 on macOS when the system OpenSSL cannot verify an Ed25519 signature. The normal macOS CI run passed before `v0.2.5` was tagged. Release packaging uses `macos-latest` for the Intel target because `macos-13` remained indefinitely queued. The unpublished `v0.2.5` run was cancelled after its replacement private key correctly failed the old public-key trust-anchor check. The committed anchor now matches that protected environment key. The public `v0.2.6` release then completed its three-platform package, manifest-signing, draft-asset re-verification, and publication sequence; its installer was independently exercised against the public release.

## Delegation

- Round 1 — research, `gpt-5.6-terra`: specify the release asset, checksum, signature, and installer-verification contract from the current repository and official GitHub evidence; files: read-only repository and primary sources; gate: orchestrator review before workflow or installer edits.
- Round 1 — research, `gpt-5.6-terra`: adversarially review the planned installer and release-workflow trust boundary, including key handling, redirects, archive paths, and atomic replacement; files: read-only repository and primary sources; gate: findings incorporated before auto-executing artefacts are authored.
- Round 2 — mechanical, `gpt-5.6-terra`: implement the settled installer, packaging, workflow, tests, and documentation in exclusive file scopes; gate: adversarial review of every script/workflow diff plus full integration verification.
- Orchestrator: resolves the release contract, assigns non-overlapping file boundaries, reviews every worker diff, performs the dedicated auto-execution safety pass, and commits only verified work.

## Acceptance

### Delivered

`tools-ki` now publishes verified compiled archives for macOS on Apple Silicon and Intel plus x86_64 glibc Linux. The public installer verifies the release manifest signature, archive checksum, archive layout, and staged executable version before atomically installing the executable and manual.

### Summary of changes

- Added tag-bound packaging and protected-environment publishing in `.github/workflows/release.yml`, with a committed Ed25519 public-key trust anchor at `release/ki-release-signing-public.pem`.
- Reworked `install.sh` and its seven black-box installer tests around signed release artifacts while retaining `--link` for checkout development.
- Documented release management, solo-maintainer protection, the generated key format, and the developer/user guide indexes.
- Updated CI and release action pins to Node 24 runtime releases and made the workflow comments match the active solo-maintainer protection baseline.
- Published [v0.2.6](https://github.com/knowledgeislands/tools-ki/releases/tag/v0.2.6) from immutable tag `692334a`.

### Verification

- `bun run test` and `bun run test:coverage` — 305 tests passed with 100% statements, branches, functions, and lines at `4cf17ad`.
- `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bash -n install.sh`, Markdown lint, and `git diff --check` — passed at `4cf17ad`.
- [Release run 30275847129](https://github.com/knowledgeislands/tools-ki/actions/runs/30275847129) — passed; it built, signed, re-downloaded, verified, and published all five `v0.2.6` assets from tag `692334a`.
- A fresh installation from the public release into an isolated temporary directory verified `darwin-arm64`, installed `ki(1)`, and reported `ki --version` as `0.2.6`.
- [CI run 30276774957](https://github.com/knowledgeislands/tools-ki/actions/runs/30276774957) — passed on Ubuntu and macOS with the Node 24 action pins at `4cf17ad`.
- `bun src/main.ts repo audit --skill ki-roadmap --repo .` — passed with zero FAIL and WARN before this packet.

### Outstanding concerns

None in this repository. Website redirect and Homebrew formula adoption are recipient-owned follow-up work.

### Mini recap

OpenSSH private keys are not suitable for this OpenSSL release signer; a rotated OpenSSL Ed25519 key requires its committed public trust anchor to rotate with it and a new immutable tag. This is documented in the release-management guide; no further learning route is proposed.
