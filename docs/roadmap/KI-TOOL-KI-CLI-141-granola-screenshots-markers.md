---
id: KI-TOOL-KI-CLI-141
area: CLI
title: Granola screenshots and markers
kind: deliver
purpose: capability
project: knowledge-acquisition
component: acquire
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-16T00:36:09Z
updated_at: 2026-10-16T00:36:09Z
---

# KI-TOOL-KI-CLI-141: Granola screenshots and markers

## Goal

Capture complete principal-owned Granola text, transcripts and MCP-returned screenshots, and support verified Acquired-folder skipping and explicit marking without changing original memberships.

## Context

The owner approved Acquire KB-ACQUIRE-004 on 16 October 2026. Its live rollout starts on 6 October and is owned by the same direct interactive session. This receiving record owns CLI delivery only; the separate retention defect KI-TOOL-KI-CLI-128 and its isolated branch remain untouched.

## Boundary

The owner's approval covers this receiving slice of the reviewed Acquire plan, necessary local implementation and verification, with no new permission question for unchanged scope. Preserve all existing ledgers, source variants, migration proof, unrelated edits and other work records. No reset, state migration, source deletion, folder removal, workspace switch, sign-out, deployment, package publication, push, self-acceptance or pruning is authorised.

## Current state

Ready under the owner's explicit approval of the concrete KB-ACQUIRE-004 plan. No implementation edits have begun. Use direct interactive delivery under the current user instruction and repository rules; do not reactivate a historical worker or infer an employee role. Record the current immutable baseline when entering implementation.

## Steps

- [ ] Extend the source adapter with explicit principal-owned listing, complete folder/transcript pagination, authoritative attachment inventory and image-block reads. Select only reviewed read tools; never execute advertised write tools during reads.
- [ ] Preserve exact returned image bytes and stable attachment identities in existing UUID packages with verifiable manifests, including explicit empty inventories. Preserve previous verified images and source variants on amendments and interruption.
- [ ] Accept an explicit Acquired folder selector and refresh override. Exclude the marker from territory routing, skip marked UUIDs only with valid local preservation/handled evidence, and report inconsistent markers without content loss.
- [ ] Add an explicit mark action with preview and confirmation. Require private marker ownership, complete current source evidence, matching committed note/image bytes and no unsafe journal; call only add_note_to_folder and verify all original memberships remain.
- [ ] Extend the machine-readable acquisition declaration validation for the separately declared marker action while preserving existing read-only adapters. Update command help, manual, completion, specification and guide together.
- [ ] Exercise supported public CLI behaviour with synthetic injected providers, covering ownership, pagination, source amendment, attachment failure and byte checks, skip/refresh, uncommitted evidence and private/idempotent marker operations.
- [ ] Run focused and full tests, coverage, TypeScript, lint, applicable native audits and post-change review. Commit only touched paths locally and return Awaiting review; the owning Acquire record performs live rollout and coordination handoff.

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

## Discussion

### Preservation and marker semantics

Acquired is a source-side progress marker. Stable UUIDs, source-account binding, hashes, manifests and committed locators remain preservation evidence. Explicit refresh detects later amendments; missing local proof is an exception, not permission to silently skip or reacquire handled material.
