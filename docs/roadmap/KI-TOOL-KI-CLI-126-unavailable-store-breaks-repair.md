---
id: KI-TOOL-KI-CLI-126
area: CLI
title: Unavailable store breaks repair
project: ways-of-working
purpose: corrective
kind: deliver
component: repo
horizon: now
status: awaiting-review
blocks: [KI-TOOL-KI-CLI-131]
blocked_by: []
baseline_ref: 5658f8766f81a24639cf205d80ad7cd9b7d0c147
created_at: 2026-10-14T08:58:13Z
updated_at: 2026-10-15T21:36:52Z
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

- [x] Add a non-throwing helper in `src/core/storage/local-stores.ts` that returns, per declared external role, either the validated store root or an unavailability reason (`not bound`, or the `repositoryStoreDirectory` message), and export it through `src/core/storage/index.ts`. Keep `registeredKnowledgeBaseStoreRoots` throwing for its other caller, `ki repo open`.
- [x] In `src/commands/repo/repair.ts`, make the registry step uniform: write the registry entry when absent for every repository, using the existing `localRegistryWrite` path and `--dry-run` handling, then for store-declaring repositories add one `status.warn` entry per unavailable role, such as `! Store: sources store is unavailable on this host (not bound); commands that need originals will fail; run ki repo --repo <root> store list`, and `Registry: complete <root>` only when every role is available. An unavailable store never sets `failed`. An invalid registry still fails as now.
- [x] Replace the failing-case assertion in `repair.test.ts` with contract tests through `run(args, context)`: an unbound `sources` role with a registry entry warns and passes, with skills projected; a bound path that no longer exists warns and passes; a Knowledge Base with no registry entry is registered and warns; `--dry-run` reports the registration without writing; the bound case keeps "Registry: complete"; an invalid registry still fails.
- [x] Add a contract test that replays the CI sequence in one sandbox without network: `ki bootstrap`, `ki registry add --repo .`, `ki repo repair --repo .` and `ki repo audit --repo .` against a store-declaring Knowledge Base fixture, asserting that repair exits 0 with the warning and that the audit runs and returns its own verdict.
- [x] Make the documentation changes listed under Documentation impact.
- [x] Run the repository checks and the Verify below.

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

## Review

### Delivered

Two commits on `main` from baseline `5658f87`: `726243d`, `fix(repo): warn on an unavailable declared store instead of failing repair`, with the code, tests and changelog, and `7eb3000`, `chore(deps): adopt patch-level dev-tool updates`, which clears the unrelated `DEPS-1` failure that held Verify 2.

### Change Summary

`ki repo repair` registers a store-declaring Knowledge Base like any other repository, reports each unbound or missing declared store as a `! Store:` warning, still projects its skills, and passes when nothing else is wrong; an invalid registry still fails. Contract tests through `run(args, context)` cover the unbound, missing-path, unregistered, dry-run and bound cases, and one test replays the CI sequence `bootstrap`, `registry add`, `repair`, `audit` in one sandbox.

### Verification

- Verify 1, at `7eb3000` with `@biomejs/biome` 2.5.15, `@vitest/coverage-v8` 5.0.3, `knip` 6.39.0 and `vitest` 5.0.3: both frozen installs pass; `bun run test:coverage` passes 1189 tests at the 100% thresholds; `bunx tsc --noEmit`, `bunx biome check .` (warnings and infos only), `bunx knip` and `mandoc -T lint man/ki.1` are clean.
- Verify 2: `ki repo audit --repo .` on tools-ki passes with FAIL=0 and two unrelated warnings, `ki-engineering` `CI-1` and `ki-repo` `HOOK-1`.
- Verify 3: passed at `726243d` against ki-principal in a throwaway home and XDG sandbox; repair exited 0 with the `sources` warning and 44 skill links, `ki diag` showed "Registry: valid", and `ki repo audit` ran to its own verdict.
- Verify 4 belongs to acceptance, after the release and ki-principal's pin bump.

### Outstanding concerns

- Verify 4 depends on the tools-ki release and ki-principal's `.github/ki-version` bump.
- `knip` 6.39.0 prints four configuration hints suggesting ignore entries in `knip.json` are now unnecessary; it still exits 0.

### Post-change review

Awaiting Kris's review through `ki-accept`.

### Mini recap

Repair now warns rather than fails on an unavailable declared store, so ki-principal's CI can reach its audit step once the release is pinned. No learning route proposed.

## Discussion

Capture was under Kris Brown's approval of 14 October 2026 to record this defect. Adoption into Now, Project `ways-of-working`, and planning to Ready were under the CI-STORE decision quoted in Context.

Warning everywhere was chosen over failing until a host marks the store absent, because the decision asks for repair that "reports an unbound store without failing", and the absence marker is not in this record. Whether a marker should later make an unmarked unbound store fail again is left to [KI-TOOL-KI-CLI-131](KI-TOOL-KI-CLI-131-host-absent-store-state.md).

One implementer in this repository is enough; the change is a single command and its tests. Do not touch `src/commands/agent/` or `src/core/agent/`, which another thread may be changing.

Implementation began on 2026-10-14 under Kris Brown's CLI126-DELIVER decision in the `ways-of-working` thread: "implement KI-TOOL-KI-CLI-126 to awaiting review, release tools-ki, bump ki-principal's .github/ki-version, and confirm ki-principal CI reaches the audit step". The code, tests and changelog are delivered from baseline `5658f87`. `bun run test:coverage` passes 1189 tests at 100%; `bunx tsc --noEmit`, `bunx biome check .`, `bunx knip` and `mandoc -T lint man/ki.1` are clean, and the local CI reproduction against ki-principal in Verify 3 passes, with repair exiting 0 and the audit running to its own verdict. Repair no longer checks registry validity up front: an invalid registry lists no entries, and writing the registration proposal reports it as invalid with the unchanged message. `man/ki.1` and `README.md` did not describe repair's store handling, so they are unchanged.

The record stays `in-progress` because Verify 2 fails: `ki repo audit --repo .` on tools-ki reports one `ki-engineering` `DEPS-1` failure, unrelated to this change, because `@biomejs/biome` 2.5.15, `@vitest/coverage-v8` 5.0.3, `knip` 6.39.0 and `vitest` 5.0.3 have now passed the 14-day adoption window. Adopting them is a package install, which the run's brief forbids, and a `dependency_holds` entry is an owner decision, so the record waits for one of those.

The hold cleared under Kris Brown's DEPS-HOLD decision of 15 October 2026: "Authorise a run to adopt the four patch-level dev-tool updates (@biomejs/biome 2.5.15, @vitest/coverage-v8 5.0.3, knip 6.39.0, vitest 5.0.3) in tools-ki in its own chore(deps) commit, re-run every gate, move KI-TOOL-KI-CLI-126 to awaiting review, cut the patch release carrying it and KI-TOOL-KI-CLI-132, bump ki-principal's .github/ki-version and watch CI to the audit step".
