---
id: 'CLI-002'
title: Deliver user-assisted ChatGPT acquisition
status: done
roadmap: cli/deliver-user-assisted-chatgpt-acquisition
blocks: —
blocked-by: —
---

## Context

The first substantive `ki` capability is acquisition of a user-provided ChatGPT conversation or project capture. It creates an immutable Knowledge Export Package (KEP) that preserves source evidence for later KBEP extraction and KBIP ingress; it does not automate ChatGPT or turn source material into governed knowledge.

## Current state

The KAF boundary is accepted in the harness, [KEP-001](https://github.com/knowledgeislands/ki-specifications/blob/main/docs/roadmap/knowledge-acquisition/plans/KEP-001-specify-kep-v0-and-acquisition-boundary.md) records the adopted Draft KIS-0002 contract, and `ki 0.1.0` provides the seed executable. The controlled local-capture adapter and deterministic KEP emission are implemented in the unreleased CLI worktree. The only permitted source is a local, user-prepared capture directory. The CLI validator accepts the corrected published KIS-0002 minimal fixture, proving interoperability for layout, checksums, inventory, identity, and relationships as well as payload-drift refusal.

## Steps

1. [x] Adopt the accepted KEP v0 specification and its validator fixtures. Stop if the normative package identity, manifest, checksum, record, asset, relationship, or omission contract remains unresolved.
2. [x] Define the local capture-input adapter for the controlled pilot layout: originals, records, binary assets, source-native relationships, and declared omissions. Reject credentials, browser state, resumable checkpoints, and inferred semantic relationships.
3. [x] Add the exact command `ki acquire chatgpt import <capture-directory> --output <kep-directory> [--dry-run] [--json]`, its root/leaf HELP, completion, diagnostics, exit codes, and unavailable/reserved behaviour from the accepted public manual.
4. [x] Implement deterministic, write-contained KEP creation: validate before writing; write only under the selected output; preserve binary bytes; produce canonical manifest, relationship ordering, and checksums; refuse unsafe, conflicting, or unrecognised output.
5. [x] Implement JSON and ordinary result reports that identify package identity, counts, declared omissions, and limits without exposing source content or secrets.
6. [x] Add fixtures for repeatable output, dry-run write-freedom, malformed records, missing assets, relationship violations, output conflicts, content drift, and validator interoperability. Prove there is no browser, network, repository-discovery, credential, or external tool access beyond the standard local filesystem and SHA-256 utilities.
7. [x] Update the CLI guide and release notes, run the KEP validator plus applicable tool checks, and prepare the plan for manual acceptance.

## Files touched

- `bin/ki` and acquisition-specific shell modules or data fixtures
- `tests/` and CI wiring
- CLI manual, help/completion material, and release documentation
- `docs/roadmap/cli/ROADMAP.md` and this plan

## Verify

1. The command creates a KEP accepted by the adopted KEP v0 validator from a user-provided local capture directory.
2. Identical inputs produce byte-identical KEP payloads and checksums; dry-run writes nothing.
3. The command never contacts ChatGPT, controls a browser, reads profiles/cookies/tokens, discovers a repository, or extracts or governs knowledge.
4. It refuses malformed input and unsafe output without partial payload publication, and names recoverable omissions accurately.
5. Bats, ShellCheck, CI, KEP validation, and applicable repository audits pass on macOS and Linux.

## Dependencies / blocks

[KEP-001](https://github.com/knowledgeislands/ki-specifications/blob/main/docs/roadmap/knowledge-acquisition/plans/KEP-001-specify-kep-v0-and-acquisition-boundary.md) in `knowledgeislands/ki-specifications` is the external normative prerequisite; harness [FND-003](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-003-define-ki-cli-user-guide-and-manual.md) supplies the final public help and command-contract wording. Neither external dependency is inferred as accepted until its owning repository records it done.

## Acceptance

### Delivered

The unreleased `ki 0.2.0` local ChatGPT capture importer creates deterministic KEP v0 packages from an explicitly user-prepared local directory, with HELP, completion, machine-readable results, validation fixtures, and user documentation.

### Summary of changes

`bin/ki` implements `ki acquire chatgpt import`; `tests/ki.bats` exercises deterministic output and safety boundaries; `tests/validate-kep.sh` validates emitted packages and correctly permits an absent empty `assets/` directory; and `docs/chatgpt-local-capture.md`, `README.md`, and `CHANGELOG.md` document the capability. The corrected published KIS-0002 minimal fixture is accepted by the CLI validator.

### Verification

At evidence revision `e1eaca8` (`test(kep): accept empty asset-free packages`), `shellcheck bin/ki install.sh tests/validate-kep.sh`, `bats tests` (13 passing), and `bash tests/validate-kep.sh /Users/krisbrown/workspaces/kis/knowledgeislands/ki-specifications/examples/kep-v0-minimal` passed. `bun /Users/krisbrown/workspaces/kis/knowledgeislands/ki-agentic-harness/skills/repo-structure/ki-tools/scripts/govern.ts audit . --reporter=terminal`, `bun /Users/krisbrown/workspaces/kis/knowledgeislands/ki-agentic-harness/skills/foundations/ki-authoring/scripts/govern.ts audit . --reporter=terminal`, and `bun /Users/krisbrown/workspaces/kis/knowledgeislands/ki-agentic-harness/skills/general-governance/ki-repo-roadmap/scripts/govern.ts audit . --reporter=terminal` each reported zero FAIL and zero WARN.

### Outstanding concerns

The implementation remains unreleased as `ki 0.2.0`; tagging, publishing, and any Homebrew formula update require separately authorised release work.

### Mini recap

The KEP fixture exposed two contract details: every top-level payload file must be checksummed, and an asset-free package may omit `assets/` entirely. The specification fixture and CLI validator now agree; a future release can publish this verified capability without extending its user-assisted boundary.

## Done

Manual acceptance confirmed the user-assisted local ChatGPT capture importer, deterministic KEP output, validation fixtures, and CLI documentation. The residual concern is that `ki 0.2.0` remains unreleased; separately authorised follow-up may tag and publish it, then update the Homebrew formula.
