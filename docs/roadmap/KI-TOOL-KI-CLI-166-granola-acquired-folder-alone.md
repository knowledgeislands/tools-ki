---
id: KI-TOOL-KI-CLI-166
area: CLI
title: Granola Acquired folder alone skips a meeting
kind: deliver
purpose: capability
project: tools-burndown
component: acquire
priority: high
size: s
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: 64dacc4e134c6552ba83029519671e6fc82c38a1
created_at: 2026-10-19T22:52:35Z
updated_at: 2026-10-19T22:52:35Z
transferred_from: Personal > Acquire intake, Kris's decision relayed on 19 October 2026
---

# KI-TOOL-KI-CLI-166: Granola Acquired Folder Alone Skips a Meeting

## Goal

`ki acquire import --adapter granola` skips every meeting in the configured Granola Acquired folder on that membership alone, so that a marked meeting is never re-read, never checked against a ledger receipt and never flagged `acquired-without-proof`.

## Context

Kris decided on 19 October, relayed by the Personal > Acquire intake: "Yeah, I completely trust the acquire folder alone. So, let's get the tools KI change done." Today routine import skips a marked meeting only after `verifyGranolaPreservation` proves a committed ledger receipt and committed document and image bytes; a marked meeting without that proof is flagged `acquired-without-proof` (`src/core/acquire/granola/import.ts`, the `acquiredFolderId` block). Marking itself stays the proof-gated step, so membership already implies a verified capture somewhere.

## Boundary

- In: the routine-import skip in `importGranola`; the `acquired-without-proof` flag reason; the tests, Specification ACQUIRE-018, the Granola guide, the manual, the command inventory and the changelog.
- Out: `ki acquire mark`, which keeps `verifyGranolaPreservation` before adding membership; `--refresh-acquired`, which still reads marked meetings again; the whole-ledger `verifyGranolaCheckpoint` integrity check; Acquire's `.acquire/granola/ledger.json`, which is neither retired nor touched; a release.

## What the ledger records

The ledger keeps recording only what an import actually captures. A marked meeting is not read, so the run adds or changes no entry for it: an entry from an earlier capture carries forward unchanged, and a marked meeting with no entry gets none. The ledger is no longer consulted to decide the skip, and an absent entry is no longer an exception. `--refresh-acquired` still reads marked meetings and records them as any other selected meeting.

## Requirements

1. A marked meeting is skipped and counted as skipped with no Granola content read, whether or not the ledger holds an entry for it.
2. Routine import calls neither the ledger receipt lookup nor `verifyGranolaPreservation`, so it runs no Git command for a marked meeting.
3. No meeting is flagged `acquired-without-proof`; the reason leaves the flag vocabulary.
4. The ledger carries an existing marked entry forward unchanged and adds none for an unrecorded marked meeting.
5. `--refresh-acquired` and `ki acquire mark` behave as before.

## Steps

- [ ] Replace the proof check with a membership-only skip in `src/core/acquire/granola/import.ts` and drop the reason from `src/core/acquire/granola/routing.ts`.
- [ ] Change the marker tests to assert the skip without receipts, no Git call, no flag and the ledger outcome.
- [ ] Update ACQUIRE-018, the Granola guide, the manual, the command inventory and the changelog.
- [ ] Run the gate and move the record to Awaiting review.

## Files touched

- `src/core/acquire/granola/import.ts`, `src/core/acquire/granola/routing.ts`
- `src/tests/cli/acquire/granola-marker.test.ts`
- `docs/specs/acquisition.md`, `docs/guides/user/granola-acquisition.md`, `man/ki.1`, `man/ki.commands.json`, `CHANGELOG.md`
- this record

## Verify

- `bun run test:coverage` passes at 100%.
- `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip` and `ki repo audit` pass.

## Dependencies / blocks

None.

## Documentation impact

### Decision Records

None: Kris's decision, quoted above, is the rationale.

### Specifications

ACQUIRE-018 changes from a proof-gated skip to a membership-only skip.

### Guides

The Granola acquisition guide's "Track Acquired notes" section and the manual's import paragraph.

### Roadmap

None.
