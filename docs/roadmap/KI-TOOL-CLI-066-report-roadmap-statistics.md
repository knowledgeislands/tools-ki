---
id: KI-TOOL-CLI-066
area: CLI
title: Report roadmap statistics
theme: cli
horizon: next
status: draft
blocks: []
blocked_by: []
baseline_ref: null
---

# Report Roadmap Statistics

## Goal

Expose useful age and staleness statistics for selected local and remote change-management records through the KI CLI.

## Context

The Harness timestamp contract proposed by `KI-HARNESS-GOV-056` introduces portable creation and update metadata. The CLI already parses and aggregates roadmap records, making it the natural place to validate timestamps, update them during deterministic mutations, and report portfolio statistics.

## Boundary

Do not infer cycle time or throughput from `updated_at`, silently rewrite manually edited records, or implement remote mutations before the remote-adapter execution boundary is delivered.

## Shaping

Extend the work-item codec with monotonic timestamp validation, preserve native GitHub and Linear timestamps at their adapters, update `updated_at` during CLI-owned local mutations, and add a statistics view covering timestamp coverage, age, inactivity, and configurable stale-active counts. Define machine-readable output only through an explicit CLI output contract rather than parsing decorative text.

## Current state

`src/core/work/items.ts` accepts a closed project-roadmap frontmatter schema and projects the common fields used by both local adapters, but it does not recognise creation or update timestamps. `ki repo roadmap list` already resolves repository selections and aggregates readable records; its output is deterministic human-readable text only. The only native roadmap mutations are horizon movement and pruning, and `KiContext.now` already provides an injectable clock for deterministic tests.

The Harness timestamp contract is now selected and planned in `KI-HARNESS-GOV-056`, fixing the intended field, precision, compatibility, mutation, and concurrency semantics. Its implementation and publication remain the only outstanding readiness dependency for this record.

## Steps

- [ ] Reconcile the accepted `KI-HARNESS-GOV-056` contract into the common work-item codec without expanding the adapter-owned metadata boundary.
- [ ] Parse the accepted timestamp fields into `WorkItem`, validate their canonical UTC representation and ordering, and distinguish complete coverage from compatibility-period absence without fabricating values.
- [ ] Add one work-item mutation renderer that preserves `created_at`, advances `updated_at` from `KiContext.now`, and is used by every CLI-owned mutation that retains the record. Pruning remains deletion and therefore writes no final timestamp.
- [ ] Add a pure statistics projection over selected roadmap inventories. Define age as report time minus creation time, inactivity as report time minus update time, and stale-active as a non-`done` record whose inactivity meets an explicitly supplied threshold.
- [ ] Add `ki repo roadmap stats` with deterministic per-repository and aggregate text output covering total records, complete and missing timestamp coverage, active records, median and maximum age, median and maximum inactivity, and stale-active identifiers when a threshold is supplied.
- [ ] Add an explicit `--format json` contract to `stats` only. Version and fixture-lock the schema; include generation time, threshold, repository identity, metrics, stale identifiers, and diagnostics rather than requiring callers to parse decorative text.
- [ ] Preserve partial results and non-zero diagnostic behaviour across absent, malformed, unsafe, and mixed selected repositories, matching the existing roadmap inventory boundary.
- [ ] Cover parsing, monotonicity, compatibility-period absence, clock injection, mutation preservation, metric definitions, threshold edges, selection aggregation, and stable text and JSON rendering through the in-process CLI seam.
- [ ] Update the public specification, README, command inventory and completions where required, and changelog.

## Files touched

- `src/core/work/items.ts`
- `src/core/work/statistics.ts` (new)
- `src/core/work/operations.ts`
- `src/core/work/index.ts`
- `src/commands/repo/roadmap.ts`
- `src/tests/cli/repo/roadmap.test.ts`
- `src/tests/cli/manage/completions.test.ts`
- `docs/specs/repository-operations.md`
- `README.md`
- `CHANGELOG.md`
- This work item

## Verify

- `bunx vitest run src/tests/cli/repo/roadmap.test.ts src/tests/cli/manage/completions.test.ts`
- `bun run test`
- `bun run test:coverage`
- `bunx tsc --noEmit`
- `ki repo audit --skill ki-engineering --repo .`
- `ki repo audit --skill ki-authoring --repo .`

## Dependencies / blocks

Implementation requires the published Harness timestamp contract from `KI-HARNESS-GOV-056`. The dependency remains narrative because roadmap dependency arrays are repository-local. Once that record is delivered, cite its commit, re-check this plan against the published contract, and change this record to `ready` without reshaping its agreed CLI boundary.

No local roadmap item blocks the work. The first delivery covers the existing local `roadmap` and `kb-streams` adapters; future GitHub Issues or Linear adapters should project their native timestamps into the same statistics model when those adapters become executable.

## Delegation

Keep codec, statistics, command rendering, and CLI tests in one implementation lane because their public contract is tightly coupled. Documentation can be updated independently only after the text and JSON output contracts are fixed, with the orchestrator retaining final consistency review.

## Documentation impact

### Decision Records

No tools-ki Decision Record is expected if implementation follows the accepted Harness timestamp contract and existing injected-capability architecture. Escalate only a material change to CLI-wide machine-output policy or roadmap mutation semantics.

### Specifications

Add normative requirements for timestamp validation and preservation, metric definitions, diagnostic behaviour, and the versioned JSON schema to `docs/specs/repository-operations.md`.

### Guides

No new guide is required. The README command reference should show the human statistics view, explicit stale threshold, and JSON automation route.

### Roadmap

Keep the Harness dependency visible here; do not create a local surrogate dependency or a remote-adapter implementation commitment.

## Discussion

### Harness dependency

The field names, precision, compatibility period, mutation semantics, and concurrency rule are fixed by the ready `KI-HARNESS-GOV-056` plan. CLI implementation waits for that contract to be delivered and published; this cross-repository dependency remains narrative because roadmap dependency arrays are repository-local.

### Historical records

Provide a bounded backfill or audit-assisted migration using Git history, with explicit handling for renamed, untracked, and shallow-clone records. Report incomplete history rather than inventing timestamps.

Do not add Git-history backfill to the first statistics delivery. During the compatibility period, report missing coverage explicitly. If the accepted Harness rollout requires CLI-owned backfill, capture it as separately reviewable migration work.

### Statistical semantics

Use elapsed durations derived from one injected report time. Exclude records without complete accepted timestamps from age and inactivity distributions while retaining them in coverage totals. Treat future timestamps as diagnostics rather than negative durations. Use a deterministic median rule and document it in the public specification.

### Staleness policy

Do not bake an estate-wide stale threshold into the CLI. `--stale-after` supplies an explicit positive duration for a report; without it, the command reports coverage, age, and inactivity but does not label records stale.
