---
id: KI-TOOL-KI-CLI-141
area: CLI
title: Granola screenshots and markers
kind: deliver
purpose: capability
project: knowledge-acquisition
component: acquire
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 14a8e39ce17e7c51b4f26d9b62c1db1a297ad002
created_at: 2026-10-16T00:36:09Z
updated_at: 2026-10-18T07:08:00Z
---

# KI-TOOL-KI-CLI-141: Granola screenshots and markers

## Goal

Capture complete principal-owned Granola text, transcripts and MCP-returned screenshots, and support verified Acquired-folder skipping and explicit marking without changing original memberships.

## Context

The owner approved Acquire KB-ACQUIRE-004 on 16 October 2026. Its live rollout starts on 6 October and is owned by the same direct interactive session. This receiving record owns CLI delivery only; the separate retention defect KI-TOOL-KI-CLI-128 and its isolated branch remain untouched.

## Boundary

The owner's approval covers this receiving slice of the reviewed Acquire plan, necessary local implementation and verification, with no new permission question for unchanged scope. Preserve all existing ledgers, source variants, migration proof, unrelated edits and other work records. No reset, state migration, source deletion, folder removal, workspace switch, sign-out, deployment, package publication, push, self-acceptance or pruning is authorised.

## Current state

Delivered under the owner-approved cross-repository scope and awaiting human review. The immutable implementation baseline remains recorded above. Live provider rollout belongs to Acquire KB-ACQUIRE-004. This direct interactive session assumes no Paperclip employee role and changes no coordination service.

## Steps

- [x] Extend the source adapter with explicit principal-owned listing, complete folder/transcript pagination, authoritative attachment inventory and image-block reads. Select only reviewed read tools; never execute advertised write tools during reads.
- [x] Preserve exact returned image bytes and stable attachment identities in existing UUID packages with verifiable manifests, including explicit empty inventories. Preserve previous verified images and source variants on amendments and interruption.
- [x] Accept an explicit Acquired folder selector and refresh override. Exclude the marker from territory routing, skip marked UUIDs only with valid local preservation/handled evidence, and report inconsistent markers without content loss.
- [x] Add an explicit mark action with preview and confirmation. Require private marker ownership, complete current source evidence, matching committed note/image bytes and no unsafe journal; call only add_note_to_folder and verify all original memberships remain.
- [x] Extend the machine-readable acquisition declaration validation for the separately declared marker action while preserving existing read-only adapters. Update command help, manual, completion, specification and guide together.
- [x] Exercise supported public CLI behaviour with synthetic injected providers, covering ownership, pagination, source amendment, attachment failure and byte checks, skip/refresh, uncommitted evidence and private/idempotent marker operations.
- [x] Run focused and full tests, coverage, TypeScript, lint, applicable native audits and post-change review. Commit only touched paths locally and return Awaiting review; the owning Acquire record performs live rollout and coordination handoff.

## Files touched

`src/commands/acquire/index.ts`, `src/core/acquire/index.ts`, `src/core/acquire/granola/{source,import,images,state,routing,projection,markdown}.ts`, one cohesive `src/core/acquire/granola/marker.ts`, `src/core/harness/inspection.ts` and its action export, existing acquisition/Granola CLI tests and fixtures, `docs/specs/acquisition.md`, `docs/guides/user/granola-acquisition.md`, `man/ki.1`, `man/ki.commands.json` and completion fixtures affected by the public grammar.

## Verify

Baseline focused acquisition tests: 155 passing; ki-self and ki-work/ki-work-roadmap audits pass. Delivery uses the public run(args, context) sandbox seam, synthetic providers only in tests, focused acquisition tests, full Vitest and 100% coverage, TypeScript, scoped Biome/rumdl, public help/manual/completion checks and native product/engineering gates.

## Dependencies / blocks

No same-repository prerequisite is fabricated; the dependency arrays remain empty. Acquire KB-ACQUIRE-004 owns the live rollout. The paired Harness and tools-ki records own their respective contracts and executable support; recheck compatibility before activating the managed projection or using live marking.

## Documentation impact

### Decision Records

No new architectural record is proposed. Preserve existing acquisition and retention decisions and record any necessary bounded design clarification here.

### Specifications

Update only the existing portable acquisition contract or native acquisition specification owned by this repository.

### Guides

Update the existing Granola operating guidance, authority boundaries, skip/refresh and image-evidence explanation without duplicating receiver queues.

### Roadmap

Maintain this record and its exact delivery review packet. Leave unrelated retained work unchanged and stop Awaiting review.

## Review

### Delivered

Public Granola import now preserves complete owned-note transcripts and MCP screenshot inventories, supports verified Acquired skipping and explicit refresh, and exposes a separate preview/confirmed additive marker action.

### Change Summary

Updated source ports, paging and image validation, manifests and recovery, routing, committed-blob proof, command grammar, declaration validation, manual/completion inventory, acquisition specifications and the user guide. Retained the existing image ingress and state layout.

### Verification

The live-transport follow-up passes the complete 1258-test suite with 100% statements, branches, functions and lines, plus TypeScript, scoped formatting, ki-self and independent recovery review. Bounded frame splitting, singleton failure, and valid/corrupt interrupted amendments with available or unavailable transcripts are covered.

The full public CLI suite passed: 1,252 tests across 72 files, with 100% statements, branches, functions and lines. TypeScript, scoped Biome/rumdl, command inventory generation, manual lint, boundary tests, ki-self and work/roadmap audits pass. A separately authorised live read-only 6 October dry run returned one owned note and a verified zero-image inventory. The native engineering audit reran the checks but reports an unrelated DEPS-1 failure: @types/node 26.6.3 to 26.6.4 is beyond its adoption window; CI-1 also warns about an inline KI pin. Dependencies and CI remain outside this approved slice.

### Outstanding concerns

Live acquisition and marker rollout remain with Acquire KB-ACQUIRE-004. MCP bytes do not establish equality with desktop originals, and source retirement remains separate. The retention defect and its isolated branch remain untouched. The repository-wide dependency-currency failure remains visible for its owner; no dependency upgrade or hold was invented to turn that audit green.

### Post-change review

An independent runtime reviewer found missing screenshot-proof validation during journal recovery and marker membership affecting unfoldered routing. Both were corrected with regressions, including unavailable-detail recovery, acquired-only notes and cross-receiver marker conflicts. Final source readback reported no remaining concrete findings. Exact candidate commit readback is retained with the delivery handoff; this is independent technical review, not impersonation of a registered employee or owner acceptance.

### Mini recap

Read import remains source-read-only. Explicit marking adds one private membership after committed preservation checks, retains every original membership and verifies the result. No deletion, reset, migration, publication or push was performed. Owner acceptance remains pending.

## Discussion

### Live transport follow-up

The owner-authorised Acquire run stopped after 27 of 52 selected notes when an image response exceeded MCPorter's daemon frame limit. This is transport evidence, not an empty source or permission to change service settings. The same approved delivery now splits only that exact oversized batch into smaller reads, retains singleton failure as an explicit journal failure, and preserves exact returned bytes. An interrupted amended generation delegates old-document verification only after the bound completed component's document, disposition and promised image evidence validate; missing or corrupt evidence fails before overwrite. The separate retention branch remains untouched.

### Preservation and marker semantics

Acquired is a source-side progress marker. Stable UUIDs, source-account binding, hashes, manifests and committed locators remain preservation evidence. Explicit refresh detects later amendments; missing local proof is an exception, not permission to silently skip or reacquire handled material.

### Independent review, 18 October 2026

Reviewed read-only at `2393f6c6` by the `ki-review` run of the ways-of-working Project, which did not write this record. The record has no Requirements section and its Verify is one paragraph of gates, so it was reviewed against its seven Steps and that paragraph. No code was changed, no Granola call was made and nothing was accepted.

- **Verdict:** ready for acceptance.
- **Steps:** the folder-marker writer `granolaFolderMarker` (`src/core/acquire/granola/source.ts`) is built only when `mark` is confirmed, calls only `add_note_to_folder`, and is never constructed by acquisition. `src/tests/cli/acquire/granola-marker.test.ts` covers, through synthetic providers, owned-note listing and pagination refusals, exact image bytes and the empty inventory, attachment failures, skip and refresh, amendments kept unmarked, committed-blob proof, uncommitted or interrupted state refused before marking, the oversized-frame split, and that marking adds only the marker membership.
- **Verify:** on the reviewed head, coverage passed 78 files and 1326 tests at 100%; tsc, biome, knip, mandoc and rumdl were clean; `ki repo audit --repo .` gave FAIL=0 with CI-1 and HOOK-1. The DEPS-1 failure the delivery recorded no longer appears.
- **Observations, not blocking:** a later record would be easier to accept with Requirements and numbered, observable Verify steps. Live acquisition and marking stay with Acquire KB-ACQUIRE-004 and were not exercised here.
