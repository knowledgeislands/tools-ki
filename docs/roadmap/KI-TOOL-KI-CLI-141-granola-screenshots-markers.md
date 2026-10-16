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
updated_at: 2026-10-16T01:04:35Z
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

The full public CLI suite passed: 1,252 tests across 72 files, with 100% statements, branches, functions and lines. TypeScript, scoped Biome/rumdl, command inventory generation, manual lint, boundary tests, ki-self and work/roadmap audits pass. A separately authorised live read-only 6 October dry run returned one owned note and a verified zero-image inventory. The native engineering audit reran the checks but reports an unrelated DEPS-1 failure: @types/node 26.6.3 to 26.6.4 is beyond its adoption window; CI-1 also warns about an inline KI pin. Dependencies and CI remain outside this approved slice.

### Outstanding concerns

Live acquisition and marker rollout remain with Acquire KB-ACQUIRE-004. MCP bytes do not establish equality with desktop originals, and source retirement remains separate. The retention defect and its isolated branch remain untouched. The repository-wide dependency-currency failure remains visible for its owner; no dependency upgrade or hold was invented to turn that audit green.

### Post-change review

An independent runtime reviewer found missing screenshot-proof validation during journal recovery and marker membership affecting unfoldered routing. Both were corrected with regressions, including unavailable-detail recovery, acquired-only notes and cross-receiver marker conflicts. Final source readback reported no remaining concrete findings. Exact candidate commit readback is retained with the delivery handoff; this is independent technical review, not impersonation of a registered employee or owner acceptance.

### Mini recap

Read import remains source-read-only. Explicit marking adds one private membership after committed preservation checks, retains every original membership and verifies the result. No deletion, reset, migration, publication or push was performed. Owner acceptance remains pending.

## Discussion

### Preservation and marker semantics

Acquired is a source-side progress marker. Stable UUIDs, source-account binding, hashes, manifests and committed locators remain preservation evidence. Explicit refresh detects later amendments; missing local proof is an exception, not permission to silently skip or reacquire handled material.
