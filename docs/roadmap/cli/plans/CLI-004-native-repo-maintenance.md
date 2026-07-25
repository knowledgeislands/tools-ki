---
id: 'CLI-004'
title: Deliver native repository maintenance through registered skills
status: in-progress
roadmap: cli/deliver-native-repository-maintenance-through-registered-skills
blocks: —
blocked-by: —
---

## Context

`ki repo audit` and `ki repo conform` must become direct Bun capabilities. They must resolve capabilities declared by the selected repository's `.ki-config.toml` from installed compatible harnesses and run their rubrics through one `tools-ki` governed-rubric runtime, rather than spawning legacy vendored scripts or requiring every repository to carry `.ki/bin` runners.

## Current state

The seed release establishes the `ki` delivery channel, and the current development surface includes local ChatGPT capture acquisition. The former harness `-/_HANDOFFS/ki/tools-ki.md` and `command-contract.md` notes supplied delivery constraints, but their vendored-dispatch and Bash-only assumptions are intentionally rejected. [FND-004](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-004-define-compatible-harness-registration.md) defines the compatible-harness, capability, projection, and CI-trust boundary.

[ADR-KI-TOOLS-001](../../decisions/ADR-KI-TOOLS-001-typescript-native-command-host.md) adopts the native Bun and TypeScript host required for the work below, and [ADR-KI-TOOLS-002](../../decisions/ADR-KI-TOOLS-002-compatible-harness-registry-and-native-operations.md) defines its registry, command, scope, and native-operation boundary. The existing Bash implementation is an interim development surface to port, not an execution architecture to extend.

The current `ki-engineering` checker still expects retired package-script aggregate runners. Its rule and CI expectation must migrate with native `ki repo audit` and `ki repo conform`; this plan does not restore a local or vendored runner merely to satisfy that obsolete check.

The generic checker, reporter, mode, ordering, and transaction logic currently collected in the harness's shared `govern.ts` and `checker.ts` belongs in `tools-ki`. A harness retains only skill-specific rubrics, evidence/context builders, and declared safe repairs. The runtime loads those definitions from the installed payload and owns audit execution, finding rendering, dry-run, ordered conform, and publication.

## Completed foundation

- Added read-only `ki diag` output for paths, installation, and configuration, plus `ki doctor` health checks for the configured KI environment.
- Adopted plural `ki completions` as the one completion command.
- Added the tracked `ki(1)` manual with a clear current-versus-planned command boundary.
- Replaced the Bash command host with typed in-process Bun and TypeScript modules, including the local ChatGPT importer and native Bun tests.
- Added a Bun-compiled standalone executable for the current development platform; `./install.sh --copy` installs that regular executable, while `./install.sh --link` explicitly links the Bun source entry point and `ki(1)`.
- Split the command surface into command-owned modules and introduced one shared read-only execution context for XDG paths, physical CWD, installation mode, and KI repository discovery.
- Added direct installed-harness discovery and a read-only `ki harness list` command. Harness identities derive from `$XDG_DATA_HOME/ki/harnesses/<owner>/<repo>/`; archive evidence is verified at acquisition rather than stored in a generated payload lock.
- Added native `ki repo audit` and transactional `ki repo conform` command hosts, with fixture-backed proof of registered in-process execution, dry-run write-freedom, guarded publication, and re-audit.

## Steps

1. ✓ Establish the TypeScript command host: a typed in-process module per command, shared diagnostics and structured result rendering, a testable command runner, and one authoritative command catalogue for help and completion output.
2. ✓ Port the released development surface — help, version, completions, diagnostics, health checks, and the local ChatGPT capture importer — from Bash to native TypeScript modules without changing its documented contract.
3. Build the release boundary: Bun-compiled standalone artefacts for supported platforms, a source-mode development entry point, and installer and test coverage that distinguish linked development installations from regular executable installs.
   - [x] Define CI jobs that build, test, smoke-test, and retain compiled macOS and Linux artefacts.
   - [ ] Retain successful hosted CI evidence and package supported distribution artefacts without publishing them.
4. ✓ Adopt the settled native-operation contract from harness [FND-004](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-004-define-compatible-harness-registration.md); stop if it leaves registry integrity, registration, migration, or CI trust unresolved.
5. Build the `ki` core around shared native facilities for installed-harness discovery, physical path resolution, `.ki-config.toml` declaration parsing, dependency ordering, and capability resolution.
   - [x] Discover physically contained installed harnesses directly from their payload, derive identity from the owner/repository path, and reject unsafe paths, links, malformed skills, and invalid registered operation modules.
   - [x] Install only the `skills/`, `agents/`, and `hooks/` archive payload directly at `$XDG_DATA_HOME/ki/harnesses/<owner>/<repo>/`; verify immutable archive evidence before extraction and migrate a managed legacy `latest/` layout without retaining `harness-lock.toml`.
   - [x] Inspect installed payloads and remove only structurally recognised, non-base harnesses, with a non-mutating dry run.
   - [x] Parse declared skill tables and resolve them only from installed harnesses.
   - [x] Order declared explicit dependencies before execution.
   - [ ] Make the canonical payload executable without nested symbolic links. Its source skills currently use shared-module links while installed-harness inspection correctly refuses them; materialise integrity-checked regular files at acquisition or replace the source links. Do not weaken or follow nested-link validation.
6. Implement explicit user and repository capability activation using only the contract's managed projection boundaries. Prove idempotence, dry-run, containment, and refusal for altered, unsafe, incompatible, or missing state.
   - [x] Bootstrap a non-overwriting, user-managed XDG configuration from detected known agents. `--refresh` redetects agents and installed harnesses, then inventories only KI-managed skills linked in configured user agent spaces; the built-in canonical harness is installed from pinned evidence, and every configured runtime receives the five core user skills: `ki-bootstrap`, `ki-delegate`, `ki-next`, `ki-plan`, and `ki-recap`. `ki dev on <path>` switches only the canonical `skills/`, `agents/`, and `hooks/` payload to a validated local checkout; `ki dev off` restores the verified canonical archive and user-skill links.
7. Implement `ki repo audit [--repo <path>] [--skill <capability>]` from the selected repository's declared registered capabilities. Prove it is read-only, runs only declared compatible rubrics, preserves the shared finding model, and names recovery without network or source-checkout fallback.
   - [x] Deliver the command host and fixture-backed registered in-process execution; refuse a nearby checkout or an unavailable verified harness with recovery guidance.
   - [ ] Move the harness's generic governed-rubric lifecycle into `tools-ki`: rubric execution, finding conversion and rendering, dependency order, dry-run, and safe publication. Define one versioned TypeScript rubric-definition contract for installed skills; do not retain `.mjs` operations, a per-skill runner, or a second wrapper convention.
   - [ ] Load each installed skill's rubric definition and evidence/context builder through Bun, then run its audit through the tools-owned runtime. Do not spawn the former CLI entry point.
   - [ ] Prove the command against the installed base harness and a real declared repository.
8. Implement `ki repo conform [--repo <path>] [--skill <capability>] [--dry-run]` with the same resolution rules. The tools-owned runtime performs the audit-gated conform lifecycle and its transaction; a skill-specific repair declares only its safe proposed changes and verification.
   - [x] Deliver the transactional host and fixture-backed dry run, guarded publication, and post-conform re-audit.
   - [ ] Replace direct-writing rubric callbacks and skill-owned persistence with declared repair plans consumed by the tools-owned transaction. Preserve resolver dependency order and retain existing fail-closed safety guarantees before any legacy write path is removed.
   - [ ] Prove native conform preserves dry-run, safe-write, and post-conform behaviour, including failures between selected skills and concurrent replacement of a proposed target.
   - [ ] Prove the command against the installed base harness and a real declared repository.
9. Provide an explicit migration path for repositories carrying generated `.ki/bin` state. Do not delete, overwrite, or use that state implicitly; retain migration and recovery proof for changed, missing, symlinked, and concurrent paths.
   - [ ] Start with this harness: prove its existing TypeScript governed checkers through an installed or explicitly linked canonical payload, then move CI, package scripts, and pre-commit one surface at a time before removing proven-redundant `.ki` material.
10. Keep HELP, completion, `ki(1)`, user documentation, installer behaviour, release notes, CI fixtures, and current command-contract references aligned. Do not tag, publish, push, or update Homebrew without separate approval.
    - [x] Align HELP, completion, `ki(1)`, and the native-operation decision with the delivered commands.
    - [ ] Align activation, installation, release notes, full CI fixtures, and public user guidance when those surfaces exist.

## Files touched

- `src/`, `bin/ki`, installer, completion, tests, build artefacts, and CI
- Native core, command catalogue, and registered-operation modules
- CLI guide, README, changelog, and roadmap material
- Migration fixtures and user-install/runtime activation documentation

## Verify

1. A clean user can install verified compatible harnesses under XDG locations and activate one named skill without activating unrelated skills.
2. A repository with declared skills passes native aggregate and scoped audit without `.ki/bin` or a nearby harness checkout.
3. Native conform makes only declared safe changes, dry-run writes nothing, and re-audit is clean.
4. Missing, altered, untrusted, incompatible, undeclared, or unsafe inputs fail before unintended user or repository mutation.
5. Focused unit and integration tests, tool audit, authoring audit, and roadmap audit pass on macOS and Linux.

## Dependencies / blocks

The former harness outbound handoffs are adopted here rather than retained as a parallel specification. Harness [FND-004](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/foundation-tooling/plans/FND-004-define-compatible-harness-registration.md) is the external architecture prerequisite; it does not transfer ownership of the `tools-ki` implementation, release, or delivery decision.
