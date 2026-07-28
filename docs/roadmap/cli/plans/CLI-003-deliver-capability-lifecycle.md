---
id: 'CLI-003'
title: 'Deliver capability lifecycle commands'
status: ready
roadmap: cli/deliver-ki-install-ki-reinstall-and-ki-uninstall-capability-lifecycle
blocks: CLI-004
blocked-by: —
baseline-ref: —
---

## Context

KI reserves `ki install`, `ki reinstall`, and `ki uninstall` for capability lifecycle management, but today only the harness-scoped `ki harness install` and `ki harness uninstall` commands exist. The public lifecycle must make target identity, ownership, activation effects, replacement, and dry-run behavior explicit before it is exposed as a V1 command family.

## Current state

- The immutable harness registry contains configured archive URL and SHA-256 evidence, while installed harnesses expose their capability inventory only after acquisition.
- `ki harness install` performs a first-install-only verified acquisition, and `ki harness uninstall` removes an explicitly installed non-canonical harness after ownership checks.
- `ki skill user` and `ki skill repo` are the only activation commands. They must remain the sole way to alter user or repository activation.
- A missing capability cannot yet be resolved to an uninstalled supplier from the current registry alone, so the public target grammar and any required provider metadata need an explicit design rather than an implicit lookup.

## Steps

1. Define the lifecycle command contract and target grammar for qualified capabilities and supplying harnesses, including resolution failure, ambiguity, canonical-harness rules, replacement, ownership proof, exit semantics, and which operation never changes activation state.
2. Extend the validated registry and installed-inventory seams only as required to resolve lifecycle targets safely; preserve immutable acquisition evidence and fail closed when a requested provider or capability cannot be proven.
3. Implement `ki install`, `ki reinstall`, and `ki uninstall` with deterministic human output and `--dry-run` behavior, reusing verified acquisition and guarded removal mechanics rather than duplicating archive or transaction code.
4. Preserve explicit user and repository activation boundaries: report affected active declarations where useful, refuse unsafe removal or replacement, and require a separate `ki skill user` or `ki skill repo` operation for any activation change.
5. Register the commands; update help, completions, `ki(1)`, the user-facing command documentation, and the V1 changelog baseline without publishing or releasing the CLI.
6. Add CLI-contract tests for qualified and bare targets, configured and unconfigured suppliers, ambiguity, canonical protection, dry-run, first install, forced reinstall, removal, active declarations, malformed registry state, acquisition failure, rollback, and unchanged state on failure; retain full coverage.

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
