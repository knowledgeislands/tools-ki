---
id: KI-TOOL-CLI-011
title: Publish independent conform repairs despite unrelated failures
theme: cli
horizon: blocking
status: acceptance
blocks: []
blocked-by: []
baseline-ref: 77a73a709ed99d553e2df58ddf991b8c50ffb699
---

## Context

`ki repo conform` currently withholds every proposed repair when any selected audit finding fails.

This prevents safe local repairs, such as a missing `.gitignore` or managed working-area scaffold, from being published when unrelated live GitHub settings or a licence decision still need attention.

## Boundary

Do not weaken write-set validation, dependency ordering, containment checks, transactional rollback, or a skill's own failure gate.

The change must not publish a repair whose preconditions, dependent audit evidence, or declared filesystem scope are invalid.

## Current state

The repository conform host stages all selected operations, then aborts before publication whenever the aggregate initial audit contains a failure.

The result reports useful proposed writes but leaves every independently safe local repair unapplied, forcing users to reproduce host-owned writes manually or resolve unrelated external drift first.

## Steps

1. Define a failure-scoped publication model that associates each proposed repair with the audit evidence, dependencies, and declared scope required to publish it safely.
2. Preserve atomic publication for writes that share a dependency or target, while allowing independent eligible repair groups to publish in the same invocation.
3. Report every repair group as applied, withheld, or refused, with the exact blocking finding or safety condition.
4. Update `ki repo conform --dry-run` to distinguish independently publishable proposals from withheld ones without mutating state.
5. Add CLI contract tests for independent local and user-home writes, overlapping targets, dependency failures, unsafe writes, command failures, and mixed local/GitHub findings.

## Files touched

- `src/core/repository-operations.ts` and the conform-planning/runtime boundary.
- `src/tests/cli/repo-conform-execution.test.ts` and related repository-operation fixtures.
- CLI help and user-facing diagnostics where the publication model changes.

## Verify

- `bun run test`
- `bunx tsc --noEmit`
- A mixed-failure fixture publishes a safe independent repair while retaining a non-zero exit and reporting the unresolved finding.
- Unsafe, overlapping, dependent, or command-backed repairs remain withheld or roll back as required by the existing transaction contract.

## Dependencies / blocks

No known external prerequisite.

This item blocks reliable incremental conformance for repositories with a mix of local drift and separately authorised live-settings work.

## Acceptance

Delivered the failure-scoped conform publisher in `src/core/conform-publication.ts` and kept `src/core/repository-operations.ts` as the command orchestrator.

Eligible direct-write groups now publish despite unrelated failures, including declared user-home writes; groups connected by a declared dependency or shared target remain indivisible.
Groups with blocking evidence, invalid writes, or command actions are respectively withheld or refused, and a mixed result remains non-zero.
Command-backed repair groups are deliberately excluded from partial publication because their side effects are outside the guarded write transaction.

Baseline: `77a73a709ed99d553e2df58ddf991b8c50ffb699`.

Delivery commit: `27148ee528d2698b1a9b2b681569be6e2a90a7e3`.

Verification passed on 2026-08-02: `bunx tsc --noEmit`; `bun run test:coverage` (454 tests, 100% statements, branches, functions, and lines); `bunx biome check`; `bunx syncpack format --check`; and `bun src/main.ts repo audit --repo .` (11 selected skills, 0 failures).

No external coordination, policy change, or follow-up handoff is required. No learning route is proposed.

## Discussion

### Approved delivery plan

Approved by the repository owner on 2026-08-02:

1. Associate every conform proposal with its declaring skill, initial audit evidence, and declared dependencies.
2. Form publication groups from declared dependencies and shared write targets, retaining each group's complete write set.
3. Publish only independently eligible direct-write groups; withhold failed, dependent, unsafe, overlapping, and command-backed groups while preserving a non-zero exit for unresolved failures.
4. Make dry-run report the same applied-versus-withheld decision without mutating state.
5. Cover the mixed local and user-home, overlap, dependency, unsafe-target, command, and external-failure contracts through the CLI seam.

### Publication boundary

“Independent” cannot mean merely a different file path.

A repair is eligible only when its own skill and declared dependencies have clean required evidence, its complete write or command set validates, and it neither overlaps nor relies on a withheld group.

### Exit status and operator feedback

The command must remain non-zero when unresolved failures remain, even if it publishes other safe groups.

Its report should make the split explicit: what changed, what was deliberately withheld, and what the operator must resolve next.

### Ownership

`tools-ki` owns the execution and transaction model.

If this changes the shared KI conformance policy, add the corresponding harness handoff or standard update before release; do not make individual skills implement ad hoc partial-publication behaviour.
