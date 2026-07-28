---
id: 'CLI-003'
title: 'Deliver capability lifecycle commands'
status: done
roadmap: cli/deliver-ki-install-ki-reinstall-and-ki-uninstall-capability-lifecycle
blocks: CLI-004
blocked-by: —
baseline-ref: 563133a8918f85fd8b3427421d4f0a2a5251d020
---

## Context

KI reserves `ki install`, `ki reinstall`, and `ki uninstall` for capability lifecycle management, but today only the harness-scoped `ki harness install` and `ki harness uninstall` commands exist. The public lifecycle must make target identity, ownership, activation effects, replacement, and dry-run behavior explicit before it is exposed as a V1 command family.

## Current state

- The immutable harness registry contains configured archive URL and SHA-256 evidence, while installed harnesses expose their capability inventory only after acquisition.
- `ki harness install` performs a first-install-only verified acquisition, and `ki harness uninstall` removes an explicitly installed non-canonical harness after ownership checks.
- `ki skill user` and `ki skill repo` are the only activation commands. They must remain the sole way to alter user or repository activation.
- A missing capability cannot yet be resolved to an uninstalled supplier from the current registry alone, so the public target grammar and any required provider metadata need an explicit design rather than an implicit lookup.

## Steps

1. ✓ Defined a three-form lifecycle grammar: harness (`owner/name`), supplier-qualified skill (`owner/name:skill`), and unambiguous installed bare skill (`skill`); failures, canonical protection, replacement, ownership, exit semantics, and the activation boundary are explicit.
2. ✓ Extended verified installation with optional required-capability proof and guarded replacement; acquisition stays tied to immutable configured evidence and fails before publication when the requested skill is absent.
3. ✓ Implemented deterministic `ki install`, `ki reinstall`, and `ki uninstall` commands with `--dry-run`, using the existing verified archive and guarded-removal seams.
4. ✓ Preserved activation boundaries: lifecycle commands never alter skill activation and refuse reinstall or removal when the harness supplies active user skills or skills declared by the current repository.
5. ✓ Registered the commands and updated root help, completions, `ki(1)`, README, a user lifecycle guide, the active-surface decision record, and the V1 changelog baseline without a release action.
6. ✓ Added CLI-contract coverage for qualified and bare targets, configured and unconfigured suppliers, ambiguity, canonical and development-link protection, dry runs, first install, forced reinstall, removal, active declarations, malformed targets and configuration, acquisition failure, rollback, and unchanged state; full coverage remains enforced.

## Files touched

- `src/commands/` lifecycle command modules, registration, help, and catalogue
- `src/core/registry.ts`, `src/core/harness.ts`, resolution, acquisition, and guarded mutation seams as needed
- `src/agents/` only where read-only activation-state evidence is needed
- `src/tests/cli/` lifecycle CLI-contract coverage and archive fixtures
- `man/ki.1`, `README.md`, user guides, and `CHANGELOG.md`

## Verify

1. Sandboxed CLI tests prove every lifecycle operation is deterministic, has no network access except the explicit verified acquisition path, and leaves configuration, activation, and installed payloads unchanged on failure or dry-run.
2. Fixture archives prove installs and forced reinstalls accept only configured immutable releases and roll back safely on invalid content or publication failure.
3. Tests prove lifecycle commands neither create nor remove user or repository activation; only the existing explicit `ki skill` operations do so.
4. `bun run test` and `bun run test:coverage` pass with the required 100% coverage thresholds.
5. `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bash -n install.sh`, `bunx prettier --check README.md CHANGELOG.md`, and `git diff --check` pass.
6. Help, completions, `ki(1)`, and user documentation show only the settled lifecycle contract; no tag, push, Homebrew update, or release workflow is invoked.

## Dependencies / blocks

CLI-003 establishes the trusted lifecycle target and mutation semantics required by CLI-004, so it blocks `CLI-004`.

The plan builds on the completed read-only status baseline in CLI-001. It does not depend on CLI-002's rubric-publication work.

## Acceptance

### Delivered

`ki install`, `ki reinstall`, and `ki uninstall` now provide verified capability lifecycle management while preserving explicit user and repository skill activation boundaries.

### Summary of changes

- Added lifecycle target parsing and command registration in `src/commands/lifecycle.ts`, including supplier-qualified capability proof and fail-closed bare-name resolution.
- Extended `src/core/registry.ts` with inspected replacement publication that retains the existing verified payload until its replacement is ready.
- Refused reinstall and removal where a supplied user skill is active or the CWD-resolved repository declares a supplied skill; no lifecycle command changes activation.
- Added 17 CLI-contract cases in `src/tests/cli/lifecycle.test.ts` and registered the public surface in completions, help, `ki(1)`, README, the user guide, decision record, and V1 changelog baseline.

### Verification

- `./bin/ki repo audit --skill ki-roadmap --repo .` — passed with no FAIL or WARN findings.
- `bun run test` — passed: 22 files and 360 tests.
- `bun run test:coverage` — passed: 100% statements, branches, functions, and lines.
- `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bash -n install.sh`, `bunx prettier --check README.md CHANGELOG.md docs/guides/user/capability-lifecycle.md docs/decisions/ADR-KI-TOOLS-002-compatible-harness-registry-and-native-operations.md`, `mandoc -T utf8 man/ki.1`, and `git diff --check` — passed.
- Evidence revision: `4feebb2` (`feat(cli): deliver capability lifecycle commands`).

### Outstanding concerns

None.

### Mini recap

The existing immutable harness registry can safely support a public capability lifecycle without a provider metadata expansion: a supplier-qualified target verifies the requested skill only after its archive is acquired and inspected, while a bare target is intentionally limited to one installed provider. CLI-004 can build update and upgrade semantics on these settled target and activation rules.

## Done

CLI-003 completed the public capability lifecycle contract and implementation, including verified replacement and explicit activation protection.

Residual concerns: None.

Intended follow-up: CLI-004 may now use the settled lifecycle target and mutation semantics for update and upgrade operations.
