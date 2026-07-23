---
id: 'CLI-004'
title: Deliver native repository maintenance through registered skills
status: open
roadmap: cli/deliver-native-repository-maintenance-through-registered-skills
blocks: —
blocked-by: —
---

## Context

`ki repo audit` and `ki repo conform` must become native CLI capabilities. They must resolve skills declared by the selected repository's `.ki-config.toml` from one verified installed collection, rather than spawning legacy vendored scripts or requiring every repository to carry `.ki/bin` runners.

## Current state

`ki 0.1.0` is publicly released and the unreleased `0.2.0` work implements local ChatGPT capture acquisition. The former harness `-/_HANDOFFS/ki/tools-ki.md` and `command-contract.md` notes supplied delivery constraints, but their vendored-dispatch and Bash-only assumptions are intentionally rejected. The harness architecture plan defines the prerequisite installed-skill registry, native operation registration, migration, and CI trust contract.

## Steps

1. Adopt the settled installed-skill registry and native-operation contract from harness [FND-004](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-004-define-installed-skill-registry.md); stop if it leaves registry integrity, registration, migration, or CI trust unresolved.
2. Build the `ki` core around shared native facilities for XDG resolution, installed-collection discovery, integrity/version checks, physical path resolution, `.ki-config.toml` declaration parsing, dependency ordering, diagnostics, and structured result rendering.
3. Implement `ki skill install` and explicit repository/global activation using only the contract's managed symlink and marker boundaries. Prove idempotence, dry-run, containment, and refusal for altered, unsafe, incompatible, or missing state.
4. Implement `ki repo audit [path] [--skill <ki-skill>]` from the selected repository's declared registered skills. Prove it is read-only, runs only declared compatible operations, preserves the shared finding model, and names recovery without network or source-checkout fallback.
5. Implement `ki repo conform [path] [--skill <ki-skill>] [--dry-run]` with the same resolution rules. Prove safe mechanical writes, dry-run write-freedom, post-conform re-audit, and refusal before partial publication.
6. Provide an explicit migration path for repositories carrying generated `.ki/bin` state. Do not delete, overwrite, or use that state implicitly; retain migration and recovery proof for changed, missing, symlinked, and concurrent paths.
7. Update HELP, completion, user documentation, installer behaviour, release notes, CI fixtures, and current command-contract references. Do not tag, publish, push, or update Homebrew without separate approval.

## Files touched

- `bin/ki`, installer, completion, tests, and CI
- Native core and registered-operation modules
- CLI guide, README, changelog, and roadmap material
- Migration fixtures and user-install/runtime activation documentation

## Verify

1. A clean user can install a verified collection under XDG locations and activate one named skill without activating unrelated skills.
2. A repository with declared skills passes native aggregate and scoped audit without `.ki/bin` or a nearby harness checkout.
3. Native conform makes only declared safe changes, dry-run writes nothing, and re-audit is clean.
4. Missing, altered, untrusted, incompatible, undeclared, or unsafe inputs fail before unintended user or repository mutation.
5. Focused unit and integration tests, tool audit, authoring audit, and roadmap audit pass on macOS and Linux.

## Dependencies / blocks

The former harness outbound handoffs are adopted here rather than retained as a parallel specification. Harness [FND-004](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-004-define-installed-skill-registry.md) is the external architecture prerequisite; it does not transfer ownership of the `tools-ki` implementation, release, or delivery decision.
