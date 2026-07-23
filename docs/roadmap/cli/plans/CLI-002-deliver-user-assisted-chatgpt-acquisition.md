---
id: 'CLI-002'
title: Deliver user-assisted ChatGPT acquisition
status: in-progress
roadmap: cli/deliver-user-assisted-chatgpt-acquisition
blocks: —
blocked-by: —
---

## Context

The first substantive `ki` capability is acquisition of a user-provided ChatGPT conversation or project capture. It creates an immutable Knowledge Export Package (KEP) that preserves source evidence for later KBEP extraction and KBIP ingress; it does not automate ChatGPT or turn source material into governed knowledge.

## Current state

The KAF boundary is accepted in the harness, [KEP-001](https://github.com/knowledgeislands/ki-specifications/blob/main/docs/roadmap/knowledge-acquisition/plans/KEP-001-specify-kep-v0-and-acquisition-boundary.md) records the adopted Draft KIS-0002 contract, and `ki 0.1.0` provides the seed executable. The controlled local-capture adapter and KEP emission remain to be implemented. The only permitted source is a local, user-prepared capture directory.

## Steps

1. [x] Adopt the accepted KEP v0 specification and its validator fixtures. Stop if the normative package identity, manifest, checksum, record, asset, relationship, or omission contract remains unresolved.
2. Define the local capture-input adapter for the controlled pilot layout: originals, records, binary assets, source-native relationships, and declared omissions. Reject credentials, browser state, resumable checkpoints, and inferred semantic relationships.
3. Add the exact command `ki acquire chatgpt import <capture-directory> --output <kep-directory> [--dry-run] [--json]`, its root/leaf HELP, completion, diagnostics, exit codes, and unavailable/reserved behaviour from the accepted public manual.
4. Implement deterministic, write-contained KEP creation: validate before writing; write only under the selected output; preserve binary bytes; produce canonical manifest, relationship ordering, and checksums; refuse unsafe, conflicting, or unrecognised output.
5. Implement JSON and ordinary result reports that identify package identity, counts, declared omissions, and limits without exposing source content or secrets.
6. Add fixtures for repeatable output, dry-run write-freedom, malformed records, missing assets, relationship violations, output conflicts, content drift, and validator interoperability. Prove there is no browser, network, repository-discovery, credential, or child-process access.
7. Update the CLI guide and release notes, run the KEP validator plus applicable tool checks, and prepare the plan for manual acceptance.

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
