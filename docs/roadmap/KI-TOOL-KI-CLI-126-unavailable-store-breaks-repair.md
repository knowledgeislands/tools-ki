---
id: KI-TOOL-KI-CLI-126
area: CLI
title: Unavailable store breaks repair
project: ways-of-working
purpose: corrective
kind: deliver
component: repo
horizon: now
status: ready
blocks: [KI-TOOL-KI-CLI-131]
blocked_by: []
baseline_ref: null
created_at: 2026-10-14T08:58:13Z
updated_at: 2026-10-14T20:58:30Z
---

# Unavailable Store Breaks Repair

## Goal

`ki repo repair` treats a Knowledge Base whose declared external store is unbound or unavailable on this host as a reported finding, not a failure: it still registers the repository, projects its skills, and passes when nothing else is wrong. ki-principal's CI then reaches its whole-tree `ki repo audit` step and goes red only on real findings.

## Context

Adopted into Now under Kris Brown's decision of 14 October 2026, recorded as CI-STORE: "adopt KI-TOOL-KI-CLI-126 into Now and plan it, so that ki repo repair reports an unbound store without failing, the audit step runs again, and CI goes red only on real findings".

**CI evidence.** ki-principal's `.github/workflows/ci.yml` installs the pinned released `ki`, then runs `ki bootstrap`, `ki registry add --repo .` and `ki repo repair --repo .` in one step before `ki repo audit --repo .`. The runner never carries ki-principal's `sources` store, so `ki registry add` writes an entry with no `stores` table, and repair stops with "declared sources store is not bound". The run on ki-principal `b73e7e4` under v0.10.4 failed there, the two runs before it failed the same way under v0.10.1, and none of the last 30 runs passed, as the ways-of-working `gate-release` run reported. The whole-tree audit has therefore not run in CI, so a known STREAM-9 failure on the mac-studio-bootstrap note is unreported.

The same defect stops repair for ki-principal on the Linux agent host vega, which carries a stopgap binding to an empty read-only directory.

**Narrowed on adoption.** This record was captured with a wider boundary: `ki repo open`, the VS Code workspace, a registry marker for a store deliberately absent on a host, distinct status reporting, and `ki repo store create` off macOS. That remainder is now [KI-TOOL-KI-CLI-131](KI-TOOL-KI-CLI-131-host-absent-store-state.md), so this record delivers only what the decision asks. Of the original design points, the decision settles the first for repair: an unbound store warns rather than fails.

## Boundary

- In: `ki repo repair` reporting an unbound or unavailable declared store as a warning entry while the run continues to registration, skill projection and its health result; registering a store-declaring Knowledge Base that has no registry entry, as repair already does for other repositories; replacing the repair contract test that asserts failure; an end-to-end reproduction of the CI sequence.
- Out: `ki repo open`, the VS Code workspace, an absence marker, store status reporting and `ki repo store create`, all in [KI-TOOL-KI-CLI-131](KI-TOOL-KI-CLI-131-host-absent-store-state.md); commands that need originals, which keep failing clearly; releasing `tools-ki`, bumping ki-principal's `.github/ki-version`, and fixing whatever the restored audit reports; changes on vega; `ki agent` code, which another thread may be changing.

## Current state

Observed at `43da380`:

- `registeredKnowledgeBaseStoreRoots` in `src/core/storage/local-stores.ts` throws `declared <role> store is not bound` for a role without a path, and `repositoryStoreDirectory` throws when a bound path is not an existing directory.
- `src/commands/repo/repair.ts` calls it inside the registry step for any repository that declares external store roles, wraps the error as "Knowledge Base <root> has an unavailable declared store …", marks the run failed and `continue`s, so `inspectRepositoryHealth` and skill linking never run. That branch also never writes a missing registry entry, unlike the branch for repositories without stores.
- `src/tests/cli/repo/repair.test.ts`, test "requires an explicit complete sources binding before repairing a Knowledge Base", asserts exit 1 for the unbound case and exit 0 with "Registry: complete" once bound.
- `ki diag` reports registry validity only and is unaffected by an unbound store. `ki repo audit` does not read stores.
- `presentation('status.warn')` already exists for warning entries.

## Steps

- [ ] Add a non-throwing helper in `src/core/storage/local-stores.ts` that returns, per declared external role, either the validated store root or an unavailability reason (`not bound`, or the `repositoryStoreDirectory` message), and export it through `src/core/storage/index.ts`. Keep `registeredKnowledgeBaseStoreRoots` throwing for its other caller, `ki repo open`.
- [ ] In `src/commands/repo/repair.ts`, make the registry step uniform: write the registry entry when absent for every repository, using the existing `localRegistryWrite` path and `--dry-run` handling, then for store-declaring repositories add one `status.warn` entry per unavailable role, such as `! Store: sources store is unavailable on this host (not bound); commands that need originals will fail; run ki repo --repo <root> store list`, and `Registry: complete <root>` only when every role is available. An unavailable store never sets `failed`. An invalid registry still fails as now.
- [ ] Replace the failing-case assertion in `repair.test.ts` with contract tests through `run(args, context)`: an unbound `sources` role with a registry entry warns and passes, with skills projected; a bound path that no longer exists warns and passes; a Knowledge Base with no registry entry is registered and warns; `--dry-run` reports the registration without writing; the bound case keeps "Registry: complete"; an invalid registry still fails.
- [ ] Add a contract test that replays the CI sequence in one sandbox without network: `ki bootstrap`, `ki registry add --repo .`, `ki repo repair --repo .` and `ki repo audit --repo .` against a store-declaring Knowledge Base fixture, asserting that repair exits 0 with the warning and that the audit runs and returns its own verdict.
- [ ] Make the documentation changes listed under Documentation impact.
- [ ] Run the repository checks and the Verify below.

## Files touched

- `src/core/storage/local-stores.ts`, `src/core/storage/index.ts`
- `src/commands/repo/repair.ts`
- `src/tests/cli/repo/repair.test.ts`
- `CHANGELOG.md`; `man/ki.1` and `README.md` only if they describe repair's store handling

## Verify

1. `bunx biome check .`, `bunx tsc --noEmit` and `bun run test` pass, with the new repair contract tests among them and no network access.
2. `ki repo audit --repo .` on tools-ki passes.
3. Local CI reproduction against ki-principal, using the built `ki` from this working tree in a throwaway XDG and home sandbox with no store bound: run `ki bootstrap`, `ki registry add --repo <ki-principal>`, `ki repo repair --repo <ki-principal>` and `ki diag`. Repair exits 0 and shows the `sources` warning and the projected skills; `ki diag` shows "Registry: valid"; then `ki repo audit --repo <ki-principal>` runs to its verdict.
4. After a release that contains this record and ki-principal's `.github/ki-version` bump, the ki-principal CI run on `main` passes the "Install released KI" step and reaches the `ki repo audit --repo .` step on the runner. If that step fails, its failures are audit findings, such as the known STREAM-9 note, not a repair or store error. This check belongs to acceptance, after the release.

## Dependencies / blocks

Not blocked. Blocks [KI-TOOL-KI-CLI-131](KI-TOOL-KI-CLI-131-host-absent-store-state.md), which reuses the availability helper and warning wording. Verify step 4 needs a `tools-ki` release and ki-principal's pin bump, both outside this record. Removing vega's stopgap binding waits for KI-TOOL-KI-CLI-131.

## Documentation impact

### Decision Records

None.

### Specifications

None.

### Guides

`CHANGELOG.md` gains an Unreleased entry saying `ki repo repair` reports an unavailable declared store as a warning instead of failing. `man/ki.1` and `README.md` change only where they describe repair's store handling.

### Roadmap

[KI-TOOL-KI-CLI-131](KI-TOOL-KI-CLI-131-host-absent-store-state.md) holds the remainder of the original boundary.

## Discussion

Capture was under Kris Brown's approval of 14 October 2026 to record this defect. Adoption into Now, Project `ways-of-working`, and planning to Ready were under the CI-STORE decision quoted in Context.

Warning everywhere was chosen over failing until a host marks the store absent, because the decision asks for repair that "reports an unbound store without failing", and the absence marker is not in this record. Whether a marker should later make an unmarked unbound store fail again is left to [KI-TOOL-KI-CLI-131](KI-TOOL-KI-CLI-131-host-absent-store-state.md).

One implementer in this repository is enough; the change is a single command and its tests. Do not touch `src/commands/agent/` or `src/core/agent/`, which another thread may be changing.
