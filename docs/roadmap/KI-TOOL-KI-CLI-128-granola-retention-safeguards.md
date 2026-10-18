---
id: KI-TOOL-KI-CLI-128
area: CLI
title: Granola retention safeguards
kind: deliver
purpose: corrective
project: knowledge-acquisition
component: acquire
status: done
blocks: []
blocked_by: []
baseline_ref: 88de22802f2a42bd5d4015f09c8fc0928307dce8
created_at: 2026-10-14T14:26:48Z
updated_at: 2026-10-18T00:02:17Z
---

# KI-TOOL-KI-CLI-128: Granola retention safeguards

## Goal

Prevent Granola resets destroying retained handling evidence or migration proof, without adding optional discovery, importer or state-root machinery.

## Context

On 14 October 2026, the owner confirmed RESET-FIRST: safe reset is this record’s first piece of work; independent `state_root` remains conditional. The refusal step explicitly covers both `--rebuild` and ordinary adapter reset before any Ready request. This documentation clarification preserves this copy’s existing lifecycle and implementation evidence; it grants no Ready transition, new coding, integration, acceptance, migration or actual reset. Receiving evidence: [owner-answer relay](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_THREADS/knowledge-acquisition/handoff-review.report.md); owner decision: [Acquire decisions](/Users/krisbrown/workspaces/personal/acquire/+/_THREADS/acquire-intake/decisions.md#decision-38-2026-10-14t225614z).

The owner permitted one defect carrier before coding on 14 October 2026, then instructed “Can we get on with both roadmap items, please?” and explicitly authorised bounded local engineering of the narrowed retention defect. [Acquire's owner log](/Users/krisbrown/workspaces/personal/acquire/+/_THREADS/acquire-intake/decisions.md#decision-34-2026-10-14t164640z) and the task grant supersede the earlier preparation-only restriction for the exact paths below. No repeated carrier/readiness question is needed. The original reservation remains in its ledger-only commit.

The [discovery simplification](/Users/krisbrown/workspaces/personal/acquire/+/_THREADS/acquire-intake/simplify-granola-discovery.report.md) retains account/UUID/package evidence and the existing canonical handled ledger/proof. An in-memory package lookup and on-demand window discovery need no second persistent index. Presence does not prove completeness or novelty; handled evidence must survive package removal. Original bytes, memberships and omissions remain protected.

## Boundary

Corrective reset retention only, confined to the five files named under Files touched. Independent `state_root`, a new discovery command or API, retry or amendment redesign, durable receipt redesign and migration are separate scope. No real reset or provider call is run.

## Current state

Corrective delivery is isolated on `fix/granola-retention-20261014` at `/Users/krisbrown/.local/state/ki/worktrees/tools-ki/granola-retention-20261014`. On 18 October 2026 the owner approved rebasing it onto `main`, resolving it against `24a584a` and `c058981`, running the checks and landing it on `main` at Awaiting review, then retiring the branch and worktree ([Product management decisions](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/+/_THREADS/product-management/decisions.md), REPO-FOLLOWUPS). Landing on `main` makes the safeguard live in the installed `ki`. Acquire's settled `+/_ACQUIRE/` placement remains inactive.

## Steps

- [x] Refuse all reset scopes, explicitly including both ordinary adapter reset (without `--rebuild`) and adapter reset with `--rebuild`, when a journal exists, the ledger is unsafe/corrupt, or the selected scope includes any non-staged disposition, including awaiting-review amendments and handled-but-absent evidence.
- [x] Replace recursive rebuild deletion with exact prevalidated staged-document and ledger paths; preserve directories, proof, assets, variants and unknown files. Component reset affects only its selected staged entry.
- [x] Show the exact deletion/update plan before confirmation and exercise legacy and capture-root layouts through the public offline CLI seam.
- [x] Complete the broader engineering gate or obtain a bounded pre-existing-gate disposition, then return Awaiting review without acceptance. The 18 October 2026 owner decision supplied the disposition: run the repository's offline checks and deliver to Awaiting review.

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

No subagents. Use the runtime-owned isolated worktree because the primary source drives live ki. Only local commits of named paths were authorised on 14 October. The 18 October 2026 decision added rebase, fast-forward landing on `main`, push and retirement of the branch and worktree. No projection change, real reset, provider call, file migration, acceptance or release.

## Review

### Delivered

Narrowed retention repair from immutable baseline `88de22802f2a42bd5d4015f09c8fc0928307dce8`, the committed approved Ready plan, rebased onto `main` and landed there on 18 October 2026. Reset refuses unsafe/interrupted or non-staged evidence and deletes only verified exact files in disposable fixtures.

### Change Summary

Removed recursive directory deletion in reset; prevalidate selected staged documents before the first mutation and show exact file deletions/updates. Refuse awaiting-review amendments conservatively, since they may carry earlier handled evidence. Preserve original attachments, source variants, proof, unknown files and directories. Source/component reset preserves unrelated ledger entries. Existing contract expectations now require retention/refusal instead of erasing handled suppression.

On 18 October 2026 the branch was rebased onto `main` past `24a584a` and `c058981`. Neither commit touches reset: they add MCP screenshot storage, private Acquired-marker verification and oversized screenshot resumption in import, and `resetGranola` on `main` still deleted state recursively and removed journals. The whole safeguard therefore remains needed and nothing was dropped. The record conflict took this delivery's lifecycle copy, whose clarification already carries `634f73e`'s RESET-FIRST wording; the guide's safety boundary keeps `main`'s screenshot and marker paragraph followed by this delivery's reset paragraphs. Code, specification and tests merged without conflict.

### Verification

After the 18 October 2026 rebase onto `main`: full suite 72 files, 1,259 tests pass, with 100% statements (12,937), branches (8,437), functions (2,907) and lines (10,982); `bunx tsc --noEmit -p tsconfig.json` passes; `bunx biome check .` exits clean, with no diagnostics in touched code and only warnings in untouched files; rumdl passes on the three touched Markdown files; `mandoc -T lint man/ki.1`, `syncpack format --check` and `git diff --check` pass. The broad ki-engineering audit was not rerun because it performs dependency registry calls, which this task does not permit. 14 October evidence remains in the [progress report](/Users/krisbrown/workspaces/personal/acquire/+/_THREADS/acquire-intake/progress-roadmap-items.report.md).

### Outstanding concerns

The broad ki-engineering audit's 14 October findings, dependency freshness and CI-pin drift, are pre-existing and outside this record; they are not fixed here and the audit was not rerun. Its objection to linked boundary dependencies was specific to the isolated worktree and does not apply on `main`.

A staged entry whose meeting carries the private Acquired marker can still be reset; the next import then flags it `acquired-without-proof` rather than silently skipping it, so evidence loss fails closed but needs a re-import. Preserved assets alone do not constitute a complete staged meeting after its document is deliberately reset. Interrupted writes require separately authorised recovery rather than journal deletion. No real reset, provider call, migration or optional discovery feature is exercised or delivered.

### Post-change review

The concrete proof/evidence-loss defect is addressed in both layouts without expanding the state model or file scope, and the rebase shows the 16 October screenshot and marker work left it unaddressed. Refusing any selected non-staged disposition prevents handling history being silently forgotten. Existing import, amendment, screenshot and marker behaviour is unchanged.

### Mini recap

One corrective slice, rebased over the screenshot and marker work, with public offline CLI proof and 100% coverage, landed on `main` at Awaiting review. Acceptance belongs to `ki-accept`; acquisition completeness, receipt design and migration remain with their receiving owners.

## Done

Accepted 2026-10-18 by Kris Brown on the review packet above.

## Discussion

### Deferred support

Independent state-root/property admission, identity-only discovery commands, durable receipt redesign and automated importer machinery remain deferred. The settled physical placement does not make them prerequisites for deterministic UUID/package discovery. Real migration needs a refreshed exact-path inventory and explicit implementation authority.

### Acceptance

Kris accepted the record on 18 October 2026 in the [Product management decisions](/Users/krisbrown/workspaces/humans-not-robots/hnr-principal/+/_THREADS/product-management/decisions.md), ACCEPT-128: “Launch a tools-ki background run to accept KI-TOOL-KI-CLI-128 under ki-accept, verifying the delivery (51e5e5b, 2bd1ffb, 32ef624, 33926e6) against the record before accepting.” Acceptance first waited on the `ki-work-roadmap` audit, because delivery commit `32ef624` had removed the Boundary section. Under BOUNDARY-128 the section was restored from scope the record already set, and the `ki-work-roadmap` and `ki-authoring` audits then passed.
