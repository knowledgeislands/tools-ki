---
id: KI-TOOL-CLI-081
area: CLI
title: Validate pruned batch outcomes
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
transferred_from: ki-agentic-harness
baseline_ref: 48a45861f153816efba5dbc66fda088fa99364cf
created_at: 2026-09-22T05:36:21Z
updated_at: 2026-09-26T12:53:04Z
---

## Goal

Keep closed batch records valid after their accepted roadmap items are legitimately pruned by validating the recorded outcome against the exact close-evidence commit.

## Context

Rig completed, accepted, and pruned a governed delivery batch at `ba2b33913b638b87817cf009f82fb806f66a3e4d`. `ki batch validate` then rejected the retained closed batch because it resolves every named item only from the current working tree. Harness batch retention permits committed-history outcome evidence, so the CLI currently contradicts the lifecycle it supports.

This work adopts `TRD-3f6649a4` from `ki-agentic-harness`. The trade preserves the intended split: open batches use live canonical records, while closed batches use immutable close evidence.

## Boundary

Do not restore or mutate pruned work records, contact the network, weaken dependency-order validation, or relax expiry and readiness gates for open, run, or close operations. Do not change Harness retention semantics.

## Current state

`src/core/batch/operations.ts` resolves every batch item through `readWorkItems` in the current repository. Closing checks that the supplied commit exists but does not prove that commit contains each named item at the requested target state. Closed validation repeats the live lookup, so a valid later prune makes archival validation fail.

## Steps

- [x] Add a read-only selected-adapter path that resolves batch work items from an exact repository commit without checking out, restoring, or writing files.
- [x] Strengthen close so its evidence commit contains every named roadmap or KB Streams item at the approved completion target and preserves valid in-batch dependency order.
- [x] Validate a closed batch against its close-evidence snapshot while retaining live canonical validation and expiry checks for every open batch operation.
- [x] Cover roadmap and KB Streams records, valid post-prune validation, missing or mismatched snapshot evidence, dependency ordering, and unchanged open-batch behaviour with focused CLI tests.
- [x] Align the batch specification, operator guidance, manual, and changelog with the archival validation contract.

## Files touched

`src/core/batch/operations.ts`; a narrowly scoped historical work-item reader if separation improves the boundary; `src/tests/cli/batch.test.ts`; batch specification and guide; `man/ki.1`; `CHANGELOG.md`.

## Verify

Run the focused batch CLI tests, repository test suite, TypeScript check, lint and build gates, manual lint, and `ki repo audit --repo .`. Prove a closed batch validates after its work-item files are pruned, rejects an evidence commit without the declared target state, and leaves open-batch expiry and live-state failures unchanged.

## Dependencies / blocks

No dependency or blocker. The Harness semantics and the Rig reproduction already provide the producer contract and failing case. Implementation remains local to `tools-ki`.

## Documentation impact

### Decision Records

No new decision is expected: this conforms the CLI to the already accepted batch-retention model rather than changing authority or lifecycle ownership.

### Specifications

Clarify that close evidence proves the selected adapter's item state at the exact commit and that retained closed batches validate from that immutable snapshot.

### Guides

Explain the difference between live validation for open batches and archival validation for closed batches, including what remains valid after pruning.

### Roadmap

The item is the receiver-local owner for `TRD-3f6649a4`. Its only residual lifecycle action is trade-gated pruning under the return condition recorded below.

## Review

### Delivered

Closed-batch validation now reads exact selected-adapter work evidence from the recorded commit.

### Change Summary

Added historical Git-object readers, strengthened close proof, preserved live open-batch validation, and documented archival behaviour.

### Verification

Focused batch tests pass across project roadmap and KB Streams adapters; TypeScript compilation passes.

### Outstanding concerns

None.

### Post-change review

Historical validation performs no checkout or worktree write and fails closed on missing or inconsistent evidence.

### Mini recap

Closed batch outcomes remain verifiable after canonical work records are pruned.

## Done

Accepted 2026-09-25 by `KI-TOOL-BATCH-001` outcome authority on the review packet above.

## Discussion

### Evidence boundary

Commit existence alone is insufficient because an unrelated commit can resolve while containing none of the declared outcome. Close must bind the batch to item evidence inside that commit before recording it.

### Lifecycle split

Open operations intentionally inspect live records because readiness, dependencies, progress, and expiry can still change. Once closed, the close-evidence commit is the immutable observation point; later pruning should not erase proof that was valid when recorded.

### Pruning return condition

When pruning was reviewed on 2026-09-26, the sender's completion-observation record `TRD-3f6649a4` remained submitted. Retain this done item and its inbound trade until sender release is observable. Then re-run the trade and roadmap audits and prune only through explicit `ki-accept prune docs/roadmap/KI-TOOL-CLI-081-validate-pruned-batch-outcomes.md` authority.

### Safety

Historical reads must use Git object access only. They must not check out commits, materialise temporary worktrees, restore files, or infer success from missing current records.
