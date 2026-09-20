---
id: KI-TOOL-CLI-077
area: CLI
title: Transfer visualisation to Observatory
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 86facd2a172bcfcde10cdc346f235401a1176f64
created_at: 2026-09-20T07:34:49Z
updated_at: 2026-09-20T19:52:12Z
---

## Goal

Move local estate visualisation into `apps-observatory` and reduce `tools-ki` to validated trade-route semantics plus a stable machine-readable application contract.

## Context

The original item placed a graphical estate surface in `tools-ki` because no separate product boundary existed. The Observatory now has an explicit repository and owns local interactive estate presentation. The existing D3 trade-route graph is the first concrete slice transferred across that boundary.

## Boundary

Retain repository discovery, route validation, reciprocity, and trade authority in `tools-ki`. Do not retain compatibility aliases for the retired HTML renderer, expose local registry paths, edit remote repository settings, push, deploy, or broaden this slice into the Observatory's larger estate roadmap.

## Current state

`tools-ki` now emits `ki/trade-routes/v1` through `ki trade routes list --estate --format json`. The D3 renderer, network weights, vendored runtime, browser opener, tests, and operator guidance have moved to `apps-observatory`. The broader visual estate scope is retained there as KI-OBS-APP-001, with the delivered route-map slice recorded as KI-OBS-VIS-001.

## Steps

- [x] Define a versioned path-free estate route projection that preserves validated route facts without presentation weights.
- [x] Move the D3 graph, network derivation, vendored runtime, browser boundary, and fixture tests to `apps-observatory`.
- [x] Remove the `--html` and redundant `--table` grammar, presentation dependencies, implementation, and obsolete tests from `tools-ki`.
- [x] Reconcile help, completions, README, manual, specification, changelog, package metadata, and roadmap ownership.
- [x] Verify both repository packages and the Observatory's engineering and roadmap contracts.

## Files touched

Trade-route command and core contracts, focused CLI tests, completions, package metadata and lockfile, user documentation, manual, specification, changelog, and this lifecycle record in `tools-ki`. The receiving application files are independently tracked in `apps-observatory`.

## Verify

Run focused trade and completion tests, the complete TypeScript/build/Biome/manual gates, the full suite with loopback permission, and the declared `ki-engineering`, `ki-repo-tools`, and `ki-work-roadmap` audits. Verify no D3 runtime, HTML renderer, browser opener, or presentation dependency remains in `tools-ki`.

## Dependencies / blocks

No remaining delivery blocker. `apps-observatory` must retain the replacement before this record is pruned; its committed KI-OBS-VIS-001 delivery provides that receiving history.

## Documentation impact

### Decision Records

No Decision Record required. This is a bounded ownership correction consistent with the existing executable/application boundary.

### Specifications

The trade specification now defines the versioned route-report schema and privacy boundary.

### Guides

The Observatory README owns startup and trust-boundary guidance. The retired CLI visualisation instructions have been removed.

### Roadmap

KI-OBS-APP-001 retains the wider Observatory product scope. KI-OBS-VIS-001 records this delivered first instrument. This record may be accepted and pruned once both repository commits exist.

## Review

### Delivered

The D3 trade-route visualisation has a runnable local application home, while `tools-ki` exposes only the route semantics and versioned evidence the application needs.

### Summary of changes

- Added the `ki/trade-routes/v1` JSON output and privacy-focused contract tests.
- Removed CLI-owned HTML rendering, browser launch, D3 assets, force-layout derivation, dependencies, and compatibility flags.
- Moved the complete interactive graph and its presentation tests into `apps-observatory`.
- Updated the CLI documentation and transferred broader roadmap ownership to KI-OBS-APP-001.

### Verification

- Focused trade and completion suites: 45 tests passed.
- `bunx tsc --noEmit`, `bun run build`, `bunx biome check .`, and `bun run ki:tools:lint-man`: passed.
- Observatory: 10 tests passed; TypeScript, compiled build, Biome, engineering audit, and roadmap audit passed.
- Full `tools-ki` suite and coverage gate: 861 tests passed with 100% statements, branches, functions, and lines.

### Outstanding concerns

The Observatory's broad product roadmap remains intentionally open. Its repository-wide audit also reports pre-existing GitHub-host defaults requiring a separate remote-settings decision; neither concern belongs in this completed ownership transfer.

### Post-change review

This removes presentation-only code and dependencies from the command host without duplicating trade semantics in the application. The route report exposes no local paths, and the Observatory validates it before deriving visual state.

### Mini recap

The visualisation moved, the provider contract narrowed, dead CLI presentation code was removed, and the wider Observatory work now has one canonical owner.

## Discussion

### Ownership outcome

`tools-ki` remains the provider-neutral command and semantic boundary. `apps-observatory` is the local interactive application. Future graphical estate instruments should consume similarly bounded machine contracts rather than extending the CLI into a website host.
