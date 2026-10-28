---
id: KI-TOOL-KI-CLI-174
area: CLI
title: Typed work naming readers
kind: deliver
purpose: corrective
component: agent
priority: high
size: s
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 9cf919cf70cebfb07f947dbdf867cc3c8f8cadd6
created_at: 2026-10-28T22:02:19Z
updated_at: 2026-10-28T22:02:19Z
---

# Typed work naming readers

## Goal

Unblock the owner-approved folder-first typed naming rollout while retaining legacy identities indefinitely.

## Context

Owner authority: Principal Ways of working decisions, "Naming first, thread types and territory coverage - 28 October 2026, 21:56 GMT". GOV-232 and CLI-173 remain unchanged optional-coordination evidence, not typed-name delivery.

## Boundary

Accept t.sop.main, t.prj.project, t.regular.main, t.regular.topic and secondary t.sop.name alongside legacy definitions. Preserve project slugs, levels, states, marks, native identities and immutable run evidence. No HNR mutation, permanent alias store, release, installation or provider action. Thread-home and hook changes only where existing exact source supports them; unsettled runtime design is a reported limitation.

## Current state

Ready under the explicit owner-approved plan. Immutable source baseline `9cf919cf70cebfb07f947dbdf867cc3c8f8cadd6`; exact owned paths and content hashes frozen in the run temporary baseline JSON before implementation.

## Plan

- [x] Update actual typed naming blockers and derived old/new home resolution.
- [x] Exercise changed identities, continuity and ambiguous definitions with focused existing tests.
- [x] Run required type checks and hooks, inspect exact commit paths and integrate verified support.

## Files touched

- `src/core/work/status.ts`
- `src/core/work/prompts.ts`
- `src/core/work/identity.ts`
- `src/core/agent/thread.ts`
- `src/tests/cli/work/status.test.ts`
- `src/tests/cli/agent-prompts.test.ts`
- `src/tests/cli/agent-threads.test.ts`

Generated coordination surfaces may change only through their canonical generator if naming wording affects them. This record is also owned.

## Verify

Focused changed-behaviour tests, installed TypeScript check and mandatory hooks. Reuse unchanged GOV-232/CLI-173 evidence; no unchanged broad test or coverage replay. Stop on actual failed gates and report genuine unrelated checker issues.

## Dependencies / blocks

Folder worker owns physical moves. Home resolution must prevent old-folder recreation before in-flight reports are homed.

## Documentation impact

Shared naming wording only as needed; no Principal canonical edit unless demonstrated necessary.

## Review

### Delivered

Typed name readers and run-home continuity delivered within the frozen seven product/test paths. The new pure identity module derives old/new names from valid definitions; no alias store or identity history is written.

### Change Summary

Status accepts typed main SoP and parents; openers classify main correctly and retain the Project registry slug. Existing mutable home APIs and report-path readers follow moved work. Both old and canonical explicit home requests resolve to the one actual package; ambiguous physical homes fail.

### Verification

Three focused CLI files: 25 tests pass. Installed TypeScript check passes. Mandatory check-only hooks run at commit. Unchanged GOV-232/CLI-173 optional-role evidence reused.

### Outstanding concerns

Capital discovery for unrecorded member-seat launches and exact-session hook selection remain separate source-assessment needs. No blanket coordinator capability requirement added.

### Post-change review

No native or launch identity mutation; legacy run directories and tokens remain intact. Ready for folder publication and owner review, without release or installation.

### Mini recap

Folder-first support is bounded to current readers and mutable home pointers. Existing definitions provide the transition map; HNR remains untouched.

## Discussion

No acceptance or terminal lifecycle change is authorised.
