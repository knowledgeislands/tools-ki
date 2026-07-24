---
id: 'CLI-004'
title: Deliver native repository maintenance through registered skills
status: in-progress
roadmap: cli/deliver-native-repository-maintenance-through-registered-skills
blocks: —
blocked-by: —
---

## Context

`ki repo audit` and `ki repo conform` must become native CLI capabilities. They must resolve capabilities declared by the selected repository's `.ki-config.toml` from verified installed compatible harnesses, rather than spawning legacy vendored scripts or requiring every repository to carry `.ki/bin` runners.

## Current state

The seed release establishes the `ki` delivery channel, and the current development surface includes local ChatGPT capture acquisition. The former harness `-/_HANDOFFS/ki/tools-ki.md` and `command-contract.md` notes supplied delivery constraints, but their vendored-dispatch and Bash-only assumptions are intentionally rejected. [FND-004](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-004-define-compatible-harness-registration.md) defines the compatible-harness, capability, projection, and CI-trust boundary.

[ADR-KI-TOOLS-001](../../decisions/ADR-KI-TOOLS-001-typescript-native-command-host.md) adopts the native Bun and TypeScript host required for the work below. The existing Bash implementation is an interim development surface to port, not an execution architecture to extend.

The current `ki-engineering` checker still expects retired package-script aggregate runners. Its rule and CI expectation must migrate with native `ki repo audit` and `ki repo conform`; this plan does not restore a local or vendored runner merely to satisfy that obsolete check.

## Completed foundation

- Added read-only `ki paths` and useful `ki doctor` output, including versioned JSON forms, for the XDG and installation baseline.
- Adopted plural `ki completions` as the one completion command.
- Added the tracked `ki(1)` manual with a clear current-versus-planned command boundary.
- Replaced the Bash command host with typed in-process Bun and TypeScript modules, including the local ChatGPT importer and native Bun tests.
- Added a Bun-compiled standalone executable for the current development platform; `./install.sh --copy` installs that regular executable, while `./install.sh --link` explicitly links the Bun source entry point and `ki(1)`.

## Steps

1. Establish the TypeScript command host: a typed in-process module per command, shared diagnostics and structured result rendering, a testable command runner, and one authoritative command catalogue for help and completion output.
2. Port the released development surface — help, version, completions, XDG paths, doctor, and the local ChatGPT capture importer — from Bash to native TypeScript modules without changing its documented contract.
3. Build the release boundary: Bun-compiled standalone artefacts for supported platforms, a source-mode development entry point, and installer and test coverage that distinguish linked development installations from regular executable installs.
4. Adopt the settled native-operation contract from harness [FND-004](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-004-define-compatible-harness-registration.md); stop if it leaves registry integrity, registration, migration, or CI trust unresolved.
5. Build the `ki` core around shared native facilities for installed-harness discovery, integrity checks, physical path resolution, `.ki-config.toml` declaration parsing, dependency ordering, and capability resolution.
6. Implement explicit user and repository capability activation using only the contract's managed projection boundaries. Prove idempotence, dry-run, containment, and refusal for altered, unsafe, incompatible, or missing state.
7. Implement `ki repo audit [--repo <path>] [--skill <capability>]` from the selected repository's declared registered capabilities. Prove it is read-only, runs only declared compatible operations, preserves the shared finding model, and names recovery without network or source-checkout fallback.
8. Implement `ki repo conform [--repo <path>] [--skill <capability>] [--dry-run]` with the same resolution rules. Prove safe mechanical writes, dry-run write-freedom, post-conform re-audit, and refusal before partial publication.
9. Provide an explicit migration path for repositories carrying generated `.ki/bin` state. Do not delete, overwrite, or use that state implicitly; retain migration and recovery proof for changed, missing, symlinked, and concurrent paths.
10. Keep HELP, completion, `ki(1)`, user documentation, installer behaviour, release notes, CI fixtures, and current command-contract references aligned. Do not tag, publish, push, or update Homebrew without separate approval.

## Files touched

- `src/`, `bin/ki`, installer, completion, tests, build artefacts, and CI
- Native core, command catalogue, and registered-operation modules
- CLI guide, README, changelog, and roadmap material
- Migration fixtures and user-install/runtime activation documentation

## Verify

1. A clean user can install a verified collection under XDG locations and activate one named skill without activating unrelated skills.
2. A repository with declared skills passes native aggregate and scoped audit without `.ki/bin` or a nearby harness checkout.
3. Native conform makes only declared safe changes, dry-run writes nothing, and re-audit is clean.
4. Missing, altered, untrusted, incompatible, undeclared, or unsafe inputs fail before unintended user or repository mutation.
5. Focused unit and integration tests, tool audit, authoring audit, and roadmap audit pass on macOS and Linux.

## Dependencies / blocks

The former harness outbound handoffs are adopted here rather than retained as a parallel specification. Harness [FND-004](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-004-define-compatible-harness-registration.md) is the external architecture prerequisite; it does not transfer ownership of the `tools-ki` implementation, release, or delivery decision.
