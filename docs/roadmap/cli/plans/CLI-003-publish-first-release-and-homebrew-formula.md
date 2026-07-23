---
id: 'CLI-003'
title: Publish first release and Homebrew formula
status: done
roadmap: cli/publish-the-first-release-and-homebrew-formula
blocks: —
blocked-by: —
---

## Context

The accepted `ki 0.1.0` seed has a local installer but no public release transport or package-manager delivery.

This plan makes that existing command available through the Knowledge Islands Homebrew tap without changing its command contract.

## Current state

`bin/ki` reports version `0.1.0`; its local installer, Bats suite, ShellCheck gate, and macOS CI exist in this repository.

`homebrew-tap` now contains `Formula/ki.rb`, alongside `Formula/mgit.rb`.

[`v0.1.0`](https://github.com/knowledgeislands/tools-ki/releases/tag/v0.1.0) tags `df27b22`, and its source archive has SHA-256 `27d1c87f0929d0fce284e22d17fd003d4d0921fb01fca40bf4e6e19f017be122`.

## Steps

1. [x] Confirm the release commit, `v0.1.0` version output, changelog, clean test baseline, and absence of an existing `ki` tag, release, or tap formula.
2. [x] Ask for explicit approval before any external publication; once approved, create and push the `v0.1.0` tag for the accepted seed commit and publish its release without adding acquisition behaviour.
3. [x] Download the published immutable `v0.1.0` source archive, calculate and record its SHA-256, and verify that the archive installs `bin/ki` without generated or untracked payloads.
4. [x] Add `homebrew-tap/Formula/ki.rb`, modelled on `Formula/mgit.rb`, with the KI description, homepage, immutable source-archive URL and SHA-256, MIT licence, `bin.install "bin/ki"`, and version/help formula tests.
5. [x] Run `brew audit`, `brew test`, and a clean source installation of `knowledgeislands/tap/ki`; verify `ki --version` and `ki --help`, then remove only the test installation if it was created solely for verification.
6. [x] Document `brew install knowledgeislands/tap/ki` in the CLI and tap user-facing documentation, including the relationship to the existing local installer.
7. [x] Run the applicable shell, documentation, roadmap, Homebrew, and clean-install checks, then prepare this plan for manual acceptance.

## Files touched

- `CHANGELOG.md`, `README.md`, release metadata, and CLI test or documentation material in `tools-ki`
- `docs/roadmap/cli/ROADMAP.md` and this plan
- `homebrew-tap/Formula/ki.rb` and its formula index or README

## Verify

1. The public `v0.1.0` tag and release resolve to the accepted seed commit, and the downloaded source archive's recorded SHA-256 matches the formula.
2. `brew audit` and `brew test` pass for `Formula/ki.rb`.
3. A clean `brew install knowledgeislands/tap/ki` installs the release archive and `ki --version` reports `ki 0.1.0` while `ki --help` retains the seed contract.
4. The documented Homebrew command works independently of the local installer, without adding acquisition or other lifecycle behaviour.
5. [CLI-002](CLI-002-deliver-user-assisted-chatgpt-acquisition.md) remains an independent, unblocked acquisition plan.

## Dependencies / blocks

This plan has no governed-plan dependency edge and does not block [CLI-002](CLI-002-deliver-user-assisted-chatgpt-acquisition.md).

External publication is deliberately gated on an explicit user approval at execution time: creating or pushing a tag, publishing a release, and pushing the Homebrew formula are out of scope until then.

## Acceptance

### Delivered

Published [`ki v0.1.0`](https://github.com/knowledgeislands/tools-ki/releases/tag/v0.1.0) from seed commit `df27b22`, with a Homebrew formula that installs the tagged source archive and retains the seed command contract.

### Summary of changes

- Added and published [the `ki` formula](https://github.com/knowledgeislands/homebrew-tap/blob/main/Formula/ki.rb), pinned to the source archive SHA-256.
- Documented `brew install knowledgeislands/tap/ki` in the CLI and tap READMEs.
- Added the missing authoring configuration and mechanically conformed the CLI Markdown baseline.

### Verification

- `shellcheck bin/ki install.sh` and `bats tests` — passed.
- `ki-authoring` and `ki-repo-roadmap` audits — passed with no FAIL or WARN findings.
- `brew audit --new knowledgeislands/tap/ki`, clean `brew install --build-from-source knowledgeislands/tap/ki`, and `brew test knowledgeislands/tap/ki` — passed.
- Installed `ki --version` reported `ki 0.1.0`; `ki --help` retained the seed help; each test installation was removed afterward.
- Evidence: `tools-ki` `02945f2`; `homebrew-tap` `2b64201`; release tag `v0.1.0` resolves to `df27b22`.

### Outstanding concerns

None.

### Mini recap

A source-archive formula gives the first release a simple, inspectable transport path while preserving the CLI's zero-dependency contract. Future releases need only repeat the tag, checksum, formula, and clean-install evidence sequence.

## Done

Manual acceptance confirmed the `ki v0.1.0` release, Homebrew formula, and clean-install evidence. CLI-002 remains the next independent capability; prune this retained record when its completed-work tranche is ready.
