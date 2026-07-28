---
id: 'CLI-004'
title: 'Deliver update and upgrade operations'
status: in-progress
roadmap: cli/deliver-package-and-harness-update-upgrade-operations
blocks: —
blocked-by: CLI-003
baseline-ref: e4b4b94ffd128ce7f618deb8bb2af25ac1cb1548
---

## Context

After lifecycle identity and mutation semantics are settled, KI needs distinct update operations: `ki update` for the locally installed CLI and verified harness sources, and CWD-resolved `ki upgrade` for compatible capability releases in a repository context. Both must be evidence-led and must not mistake a Homebrew, installer, or local development installation for another distribution channel.

## Current state

- The installer can resolve a signed CLI release and replace its binary and manual, while Homebrew and a local development link remain distinct installation modes with no generic self-update contract.
- Harness registry entries identify immutable archive URLs and SHA-256 values, but the installed `latest` slot does not record the resolved release provenance needed for a current/stale comparison.
- `ki outdated` deliberately reports that missing evidence instead of claiming freshness; it performs neither a network check nor a mutation.
- Repository skill declarations remain scope-bound activation inputs, and lifecycle targets will be defined by CLI-003 before update or upgrade may mutate installed capability sources.

## Steps

1. ✓ Defined separate, evidence-led contracts for `ki update` and CWD-resolved `ki upgrade`: target selection, unavailable-evidence and no-op outcomes, dry-run behavior, exit semantics, and the explicit no-release boundary.
2. ✓ Added an installer receipt written only by a verified release installation; it records the executable, manual, and preserved installer paths. Harnesses continue to refresh only from configured immutable URL-and-digest evidence. No newer-candidate comparison is claimed, so `ki outdated` correctly retains unavailable-evidence reporting.
3. ✓ Implemented `ki update` to refresh configured installed harnesses and run the recorded installer only when it owns the current regular executable. Local-development and externally managed installations are refused rather than self-replaced.
4. ✓ Implemented `ki upgrade` against uniquely resolved current-repository declarations. Provider selection is deterministic; each replacement is guarded and retains every existing supplied capability, and neither activation scope is changed.
5. ✓ Retained `ki outdated` unchanged because the new receipt and configured release evidence do not make an installed source comparable with a newer candidate.
6. ✓ Registered the commands and updated help, completions, `ki(1)`, release and user documentation, the active-surface decision record, and the V1 changelog baseline without creating a tag, pushing, publishing, or modifying the Homebrew tap.
7. ✓ Added CLI-contract tests with injected fetchers, fixture archives, and runner failures for supported and unsupported executable ownership, invalid receipts, immutable evidence, no-op, dry-run, repository selection, ambiguity, capability retention, process failure, and unchanged state on error; full coverage remains enforced.

## Files touched

- `src/commands/` update and upgrade command modules plus registration and catalogue
- `src/core/` installer receipt, injected process runner, registry, acquisition, harness, repository-resolution, and guarded replacement seams
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
