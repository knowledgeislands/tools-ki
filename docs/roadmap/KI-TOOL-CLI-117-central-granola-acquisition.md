---
id: KI-TOOL-CLI-117
area: CLI
title: Central Granola Acquisition
kind: deliver
purpose: capability
component: acquire
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 7b1cfb3b69657fb05540a2cc7eebff3d33cbcb4c
created_at: 2026-10-10T05:54:13Z
updated_at: 2026-10-10T06:11:24Z
---

# Central Granola Acquisition

## Goal

Acquire several Granola territory folders into one temporary inbox, report unmatched identities without importing them, and preserve checkpoints when handled captures leave the inbox.

## Context

Kit explicitly approved the reviewed central Granola rollout on 10 October 2026 and requested immediate implementation. Humans Not Robots is the renamed Granola folder; Techmedix is the correct title. The scope is Granola acquisition and its local receiving routes, not live ChatGPT instruction deployment.

## Boundary

Apply only this owner-approved rollout. Preserve existing ChatGPT captures and all verified Granola evidence. Acquisition is read-only at Granola; no source edits, tags, deletion, scheduling, push, release or unattended reconciliation is authorised. Do not change unrelated working-tree files.

## Current state

Granola imports target six separate Knowledge Bases. Kit Acquire is an existing private temporary capture repository. The importer already accepts multiple folder IDs, but unmatched identities stop acquisition and its layout is tied to a receiver Harbour. Legacy schedules are disabled.

## Steps

- [x] Add explicit flag-only routing and territory-aware capture layout with state outside capture folders.
- [x] Keep one package per meeting UUID and all folder and territory evidence; preserve safe handling and image behaviour.
- [x] Prove the public CLI contracts, document the operator route, build and activate the verified local executable.

## Files touched

The relevant acquisition implementation, contract or receiver declarations and captures; its operator guidance; this record. Exact delivered paths are recorded in Review.

## Verify

Public CLI tests and coverage, TypeScript, Biome, the focused KI Self and engineering audits, and an actual source read-only acquisition repeat.

## Dependencies / blocks

The shared contract is owned by the KI Agentic Harness; executable behaviour by tools-ki; the private capture migration and each receiving declaration remain owner-authorised. Deliver the compatible contract and implementation before activating the new receiver.

## Documentation impact

### Decision Records

The direct owner decision is recorded here; no unrelated territorial authority is changed.

### Specifications

The shared acquisition contract gains central inbox and flag-only semantics.

### Guides

Update the relevant operator guidance and superseded receiver entry points.

### Roadmap

This is approved immediate delivery and stops at Awaiting review.

## Review

### Delivered

The approved central Granola acquisition behaviour is delivered from immutable baseline `7b1cfb3b69657fb05540a2cc7eebff3d33cbcb4c`. The executable supports one receiving repository for several territory folders, explicit flag-only routing, original image exports, retained handled checkpoints and safe recovery. The owner-authorised private migration and local executable activation completed. Acquisition remains read-only and on demand; this work creates no schedule, provider mutation, automatic reconciliation, publication or push.

### Change Summary

- `src/core/acquire/granola/routing.ts` validates the central capture directory and complete explicit folder-to-territory mapping, deduplicates memberships and reports unmatched live folders, including empty folders.
- `src/core/acquire/granola/layout.ts`, `projection.ts` and `markdown.ts` implement safe package paths, faithful listing metadata and complete folder and territory provenance. Several territories or unmapped memberships use `_review`; title or date amendments retain the existing package path.
- `src/core/acquire/granola/import.ts`, `state.ts` and `images.ts` keep central checkpoint, journal and flag metadata outside capture folders, preserve original image bytes, reject unsafe parent directories, retain handled checkpoints after removal and preserve entire packages through territory amendments and interrupted recovery. Legacy receiver layout remains supported during this authorised cutover.
- `src/core/acquire/granola/source.ts` binds the account to the proven original `email`, `active_workspace` and `mcp_note_access` projection. Missing identity or scope fields fail visibly; workspace inventory, plan metadata and sign-out links do not change account identity. This corrects a provider metadata addition without weakening the account, workspace or access-scope guard.
- `src/commands/acquire/index.ts` reports flagged identities and unmatched folders. `src/tests/cli/acquire/granola.test.ts` and `_granola_helper.ts` exercise the behaviour through the public CLI and actual provider account schema.
- `docs/guides/user/granola-acquisition.md`, `man/ki.1`, generated `man/ki.commands.json` and `CHANGELOG.md` describe the operator route and current behaviour. Private meeting content, source UUIDs and account evidence remain in the private receiving estate.

### Verification

- Public executable suite: 64 test files and 1,104 tests passed; all product statements, branches, functions and lines reached 100% coverage. The Granola lane includes 124 CLI contracts.
- TypeScript, Biome, Markdown, manual lint, generated command inventory, whitespace checks and compiled executable build passed.
- Focused KI Self audit passed. The engineering audit completed with no failures and one pre-existing CI-1 warning about an inline workflow version pin.
- The private central receiver completed a full-history read-only import from 1970-01-01 through 2026-10-10. An immediate repeat reported every selected meeting unchanged, made no transcript reads and left its checkpoint unchanged; unfoldered identities were reported again without content acquisition.
- The root coordinator activated the verified executable atomically, retained the previous executable and manual in local backup state, and verified the installed executable against the central checkpoint. Reconciliation passed with available transcripts, retained historical handled entries and no in-progress journal. Source mutations, duplicate captures and writes to another receiver were absent.

### Outstanding concerns

The pre-existing CI-1 workflow pin warning remains outside this approved scope. No acquisition failure or implementation blocker remains. Local commits are not pushed, and this work does not accept or prune its own record.

### Post-change review

The implementation satisfies the approved receiving and routing behaviour and keeps acquisition separate from durable reconciliation. Public CLI evidence covers flag-only content boundaries, changed account and access scopes, missing handled transcript verification, source amendments, original image checksums, unsafe paths, complete-package moves and interrupted recovery. Local activation and a real unchanged source repeat confirm that the compatible Harness contract and executable agree. The work is ready for human review.

### Mini recap

Central acquisition, safe retained checkpoints and faithful evidence packages are implemented, documented, verified and locally activated. The remaining warning belongs to the existing CI configuration. Reusable routing and lifecycle semantics remain with the Harness; implementation details remain in this repository's operator guide. Human acceptance owns terminal closure and pruning.

## Discussion

### Approval and operating policy

Kit approved the presented centralisation plan and corrected the title to Techmedix. Imports remain on demand; source retirement and autonomous harvesting require separate authority. Technical checkpoint state survives handled capture removal and is not a hand-maintained capture index.
