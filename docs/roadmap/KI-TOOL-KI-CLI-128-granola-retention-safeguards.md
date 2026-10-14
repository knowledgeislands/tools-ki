---
id: KI-TOOL-KI-CLI-128
area: CLI
title: Granola retention safeguards
kind: deliver
purpose: corrective
project: knowledge-acquisition
component: acquire
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 88de22802f2a42bd5d4015f09c8fc0928307dce8
created_at: 2026-10-14T14:26:48Z
updated_at: 2026-10-14T17:04:12Z
---

# KI-TOOL-KI-CLI-128: Granola retention safeguards

## Goal

Prevent Granola resets destroying retained handling evidence or migration proof, without adding optional discovery, importer or state-root machinery.

## Context

The owner permitted one defect carrier before coding on 14 October 2026, then instructed “Can we get on with both roadmap items, please?” and explicitly authorised bounded local engineering of the narrowed retention defect. [Acquire's owner log](/Users/krisbrown/workspaces/personal/acquire/+/_THREADS/acquire-intake/decisions.md#decision-34-2026-10-14t164640z) and the task grant supersede the earlier preparation-only restriction for the exact paths below. No repeated carrier/readiness question is needed. The original reservation remains in its ledger-only commit.

The [discovery simplification](/Users/krisbrown/workspaces/personal/acquire/+/_THREADS/acquire-intake/simplify-granola-discovery.report.md) retains account/UUID/package evidence and the existing canonical handled ledger/proof. An in-memory package lookup and on-demand window discovery need no second persistent index. Presence does not prove completeness or novelty; handled evidence must survive package removal. Original bytes, memberships and omissions remain protected.

## Current state

Corrective delivery is isolated on `fix/granola-retention-20261014` at `/Users/krisbrown/.local/state/ki/worktrees/tools-ki/granola-retention-20261014`. Primary tools-ki source drives live ki; it is not edited or activated. Delivery is held In progress at the broader engineering gate. Acquire's settled `+/_ACQUIRE/` placement remains inactive.

## Steps

- [x] Refuse all reset scopes when a journal exists, the ledger is unsafe/corrupt, or the selected scope includes any non-staged disposition, including awaiting-review amendments and handled-but-absent evidence.
- [x] Replace recursive rebuild deletion with exact prevalidated staged-document and ledger paths; preserve directories, proof, assets, variants and unknown files. Component reset affects only its selected staged entry.
- [x] Show the exact deletion/update plan before confirmation and exercise legacy and capture-root layouts through the public offline CLI seam.
- [ ] Complete the broader engineering gate or obtain a bounded pre-existing-gate disposition, then return Awaiting review without activation, integration or acceptance. The code/specification/guide, focused tests, TypeScript and 100% coverage are delivered locally.

## Files touched

Only `src/core/acquire/granola/import.ts`, `src/tests/cli/acquire/granola.test.ts`, `docs/specs/acquisition.md`, `docs/guides/user/granola-acquisition.md` and this record.

## Verify

Public `run(args, context)` sandbox fixtures: `bun run test -- src/tests/cli/acquire/granola.test.ts src/tests/cli/acquire/adapters.test.ts`; TypeScript `bunx tsc --noEmit -p tsconfig.json`; `bun run test:coverage` at 100% statements/branches/functions/lines; focused `ki-work`, `ki-work-roadmap`, `ki-self`, `ki-engineering`, Biome, rumdl and `git diff --check`. No provider or real reset is run. The broad engineering audit performs registry calls; after discovering this no-remote breach, do not rerun it under this task.

## Dependencies / blocks

No build-order dependency. No Harness change is required: its current acquisition contract already mandates surviving handled checkpoint evidence and recoverable migration proof. No new property, schema or catalogue capability is introduced. Source completeness and future receipt ownership remain receiving-owned; optional discovery API, independent state root, retry/amendment redesign and migration are separate scope.

## Documentation impact

### Decision Records

No new architecture, receipt policy or source-retirement decision. The existing acquisition command-boundary decision remains applicable.

### Specifications

ACQUIRE-016 now specifies exact reset plans, conservative refusal and preservation of proof/assets in legacy and central layouts.

### Guides

The existing Granola guide explains exact-file reset, refusal and the separate interruption-recovery boundary; no permission to discard journals is inferred.

### Roadmap

This single corrective carrier reaches Awaiting review. Acquire's migration and broader binary investigation remain Draft; no record is accepted, pruned or created.

## Delegation

No subagents. Use the runtime-owned isolated worktree because the primary source drives live ki. Only local commits of named paths are authorised. No primary integration, projection change, real reset, provider call, file migration, cleanup, acceptance, release or push. The worktree remains an active review delivery until separately authorised integration/retirement.

## Review

### Delivered

Narrowed retention repair from immutable baseline `88de22802f2a42bd5d4015f09c8fc0928307dce8`, the committed approved Ready plan. No live CLI activation. Reset refuses unsafe/interrupted or non-staged evidence and deletes only verified exact files in disposable fixtures.

### Change Summary

Removed recursive directory deletion in reset; prevalidate selected staged documents before the first mutation and show exact file deletions/updates. Refuse awaiting-review amendments conservatively, since they may carry earlier handled evidence. Preserve original attachments, source variants, proof, unknown files and directories. Source/component reset preserves unrelated ledger entries. Existing contract expectations now require retention/refusal instead of erasing handled suppression.

### Verification

Focused acquisition fixtures: 143 tests pass. Full suite: 69 files, 1,155 tests pass, with 100% statements (12,391), branches (8,021), functions (2,825) and lines (10,510). TypeScript and scoped Biome pass. The isolated checkout initially lacked boundary-tool dependencies; linking the existing local dependency cache corrected that fixture setup without network or installation. Final scoped authoring, governance, engineering and hook evidence is consolidated in the [progress report](/Users/krisbrown/workspaces/personal/acquire/+/_THREADS/acquire-intake/progress-roadmap-items.report.md).

### Outstanding concerns

The broader ki-engineering audit fails pre-existing dependency freshness and CI-pin drift, and rejects linked boundary evidence outside the worktree. No dependency/configuration drift is changed under this narrow file grant. Full offline tests and coverage passed; they do not erase that audit failure. Running the broad audit also breached the task’s no-remote rule through dependency registry lookups. The route is stopped, with no dependency/environment/configuration change to repair or hide the failure.

Delivery is not integrated into the primary/live source. Preserved assets alone do not constitute a complete staged meeting after its document is deliberately reset. Interrupted writes require separately authorised recovery rather than journal deletion. No real reset/provider/migration or optional discovery feature is exercised or delivered.

### Post-change review

The concrete proof/evidence-loss defect is addressed in both layouts without expanding the state model or file scope. Scope remains conservative: refusing any selected non-staged disposition prevents handling history from being silently forgotten. Existing non-reset import, amendment and on-demand UUID/package behaviour is unchanged. The tested corrective candidate is reviewable, but the broader engineering audit is not clean; do not infer Awaiting review or acceptance.

### Mini recap

One isolated corrective slice, public offline CLI proof and 100% coverage. Resolve the engineering-gate disposition before an Awaiting review transition; separately bounded primary integration follows only after review; acquisition completeness/receipt design and migration remain with their receiving owners. No durable policy or broader work is promoted automatically.

## Discussion

### Deferred support

Independent state-root/property admission, identity-only discovery commands, durable receipt redesign and automated importer machinery remain deferred. The settled physical placement does not make them prerequisites for deterministic UUID/package discovery. Real migration needs a refreshed exact-path inventory and explicit implementation authority.
