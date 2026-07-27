---
id: 'CLI-004'
title: 'Deliver update and upgrade operations'
status: open
roadmap: cli/deliver-package-and-harness-update-upgrade-operations
blocks: —
blocked-by: CLI-003
baseline-ref: —
---

## Context

After lifecycle identity and mutation semantics are settled, KI needs distinct update operations: `ki update` for the locally installed CLI and verified harness sources, and CWD-resolved `ki upgrade` for compatible capability releases in a repository context. Both must be evidence-led and must not mistake a Homebrew, installer, or local development installation for another distribution channel.

## Current state

- The installer can resolve a signed CLI release and replace its binary and manual, while Homebrew and a local development link remain distinct installation modes with no generic self-update contract.
- Harness registry entries identify immutable archive URLs and SHA-256 values, but the installed `latest` slot does not record the resolved release provenance needed for a current/stale comparison.
- `ki outdated` deliberately reports that missing evidence instead of claiming freshness; it performs neither a network check nor a mutation.
- Repository skill declarations remain scope-bound activation inputs, and lifecycle targets will be defined by CLI-003 before update or upgrade may mutate installed capability sources.

## Steps

1. Define separate, evidence-led contracts for `ki update` and CWD-resolved `ki upgrade`: supported distribution modes, target selection, no-op and unavailable-evidence outcomes, network policy, confirmation or dry-run behavior, exit semantics, and explicit non-goals.
2. Add the minimum trusted provenance and release-discovery contract required to compare an installed CLI or harness release with a verified candidate; retain immutable URL, digest, signature, and distribution evidence, and fail closed when it is absent or incompatible.
3. Implement `ki update` to refresh only supported CLI-distribution and configured-harness targets, refusing local-development and externally managed installations rather than attempting a generic executable self-replacement.
4. Implement `ki upgrade` against the resolved repository declaration and CLI-003 lifecycle targets, with deterministic selection, ambiguity refusal, atomic guarded replacement, rollback, and no activation-scope mutation.
5. Extend `ki outdated` only where the new provenance contract yields a truthful comparable result; retain explicit unavailable-evidence reporting for every unsupported or unrecorded source.
6. Register the commands; update help, completions, `ki(1)`, release and user documentation, and the V1 changelog baseline without creating a tag, pushing, publishing, or modifying the Homebrew tap.
7. Add CLI-contract tests using injected fetchers and fixture archives for supported and unsupported distribution modes, signed and immutable evidence failure, no-op, dry-run, repository selection, ambiguity, partial-write rollback, and unchanged state on error; retain full coverage.

## Files touched

- `src/commands/` update, upgrade, and status command modules plus registration and catalogue
- `src/core/` installation-mode, release provenance, registry, acquisition, harness, repository-resolution, and guarded transaction seams
- `src/tests/cli/` update and upgrade CLI-contract coverage, fixture archives, and fault-injection cases
- `install.sh`, `man/ki.1`, `README.md`, release/user guides, and `CHANGELOG.md`

## Verify

1. Sandboxed CLI tests prove `ki update` distinguishes supported installer-managed targets from Homebrew, local-development, and other externally managed installations without overwriting any executable it does not own.
2. Tests prove every CLI and harness candidate is discovered and acquired only through the settled trusted evidence path; invalid, changed, unsigned, redirected, or incompatible evidence fails before mutation.
3. Tests prove `ki upgrade` resolves only the current repository's declared compatible targets, rejects ambiguity or missing provenance, preserves user and repository activation, and rolls back every partial replacement.
4. `ki outdated` distinguishes comparable current/stale evidence from unavailable evidence without making network requests unless the explicit update or upgrade contract requires one.
5. `bun run test` and `bun run test:coverage` pass with the required 100% coverage thresholds.
6. `bunx biome check .`, `bunx tsc --noEmit`, `bunx knip`, `bash -n install.sh`, `bunx prettier --check README.md CHANGELOG.md`, and `git diff --check` pass.
7. Help, completions, `ki(1)`, and documentation reflect supported distribution boundaries; no release, tag, push, or Homebrew-tap modification occurs.

## Dependencies / blocks

CLI-004 is blocked by CLI-003 because lifecycle target identity, ownership, and mutation semantics are prerequisites for a safe upgrade operation.

CLI-001 supplies the read-only evidence baseline; CLI-004 may strengthen its output only when the new provenance contract makes that result truthful. CLI-002 is independent.
