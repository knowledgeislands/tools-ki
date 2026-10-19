---
id: KI-TOOL-KI-CLI-166
area: CLI
title: Granola Acquired membership skip
kind: deliver
purpose: capability
project: tools-burndown
component: acquire
priority: high
size: s
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 64dacc4e134c6552ba83029519671e6fc82c38a1
created_at: 2026-10-19T22:52:35Z
updated_at: 2026-10-19T22:58:12Z
transferred_from: Personal > Acquire intake, Kris's decision relayed on 19 October 2026
---

# KI-TOOL-KI-CLI-166: Granola Acquired Membership Skip

## Goal

`ki acquire import --adapter granola` skips every meeting in the configured Granola Acquired folder on that membership alone, so that a marked meeting is never re-read, never checked against a ledger receipt and never flagged `acquired-without-proof`.

## Context

Kris decided on 19 October, relayed by the Personal > Acquire intake: "Yeah, I completely trust the acquire folder alone. So, let's get the tools KI change done." Marking stays the proof-gated step, so membership already implies a capture that was verified when it was marked.

## Boundary

- In: the routine-import skip in `importGranola`; the `acquired-without-proof` flag reason; the tests, Specification ACQUIRE-018, the Granola guide, the manual, the command inventory and the changelog.
- Out: `ki acquire mark`, which keeps `verifyGranolaPreservation` before adding membership; `--refresh-acquired`, which still reads marked meetings again; the whole-ledger `verifyGranolaCheckpoint` integrity check; Acquire's `.acquire/granola/ledger.json`, which is neither retired nor touched; a release.

## Current state

Routine import skips a marked meeting only after `verifyGranolaPreservation` proves a committed ledger receipt and committed document and image bytes; a marked meeting without that proof is flagged `acquired-without-proof` (`src/core/acquire/granola/import.ts`, the `acquiredFolderId` block).

## What the ledger records

The ledger keeps recording only what an import actually captures. A marked meeting is not read, so the run adds or changes no entry for it: an entry from an earlier capture carries forward unchanged, and a marked meeting with no entry gets none. The ledger is no longer consulted to decide the skip, and an absent entry is no longer an exception. `--refresh-acquired` still reads marked meetings and records them as any other selected meeting.

## Requirements

1. A marked meeting is skipped and counted as skipped with no Granola content read, whether or not the ledger holds an entry for it.
2. Routine import calls neither the ledger receipt lookup nor `verifyGranolaPreservation`, so it runs no Git command for a marked meeting.
3. No meeting is flagged `acquired-without-proof`; the reason leaves the flag vocabulary.
4. The ledger carries an existing marked entry forward unchanged and adds none for an unrecorded marked meeting.
5. `--refresh-acquired` and `ki acquire mark` behave as before.

## Steps

- [x] Replace the proof check with a membership-only skip in `src/core/acquire/granola/import.ts` and drop the reason from `src/core/acquire/granola/routing.ts`.
- [x] Change the marker tests to assert the skip without receipts, no Git call, no flag and the ledger outcome.
- [x] Update ACQUIRE-018, the Granola guide, the manual, the command inventory and the changelog.
- [x] Run the gate and move the record to Awaiting review.

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

## Review

### Delivered

The whole record, from baseline `64dacc4e` on 19 October 2026, by the `granola` run in the tools-burndown Project.

### Change Summary

- `src/core/acquire/granola/import.ts`: the Acquired block now validates the private marker as before and, unless `--refresh-acquired` is given, drops every marked meeting from the selection and counts it as skipped; the ledger lookup, the `verifyGranolaPreservation` call and the flag are gone.
- `src/core/acquire/granola/routing.ts`: `acquired-without-proof` leaves the flag reasons.
- `src/tests/cli/acquire/granola-marker.test.ts`: the fixture records each Git call; the old flag case becomes a skip without a receipt, a Git call or a flag, then a `--refresh-acquired` capture; a new case marks an uncommitted capture and checks that its entry carries forward unchanged with no content read or Git call.
- Documentation: ACQUIRE-018, the Granola guide, the manual, the regenerated command inventory and a changelog line.
- Deviations: none.

### Verification

| Requirement | Evidence |
| --- | --- |
| 1 | `skips an Acquired marker on membership alone…` and `carries an uncommitted marked entry forward…`: `1 skipped`, no `get_meetings` or transcript call |
| 2 | Both cases assert no `git:` call during the routine import |
| 3 | Both cases: no `acquired-without-proof`, `0 flagged`; the type no longer admits the reason |
| 4 | Empty ledger meetings for an unrecorded marked meeting; an equal entry after the carried-forward run |
| 5 | The existing refresh, mark, amendment and failed-marker cases pass unchanged |

- Gate:
  - `bun run test:coverage` passed: 82 files and 1,406 tests, all at 100%. The first two attempts failed only for causes outside this change: another session's coverage run held the reports directory, and then an `agent.test.ts` temporary-directory teardown race, which passed on its own and in the next full run.
  - `bunx tsc --noEmit`, `bunx biome check .`, `bunx rumdl check .`, `bunx knip`, `mandoc -T lint man/ki.1` and the command-inventory check all passed.
  - `ki repo audit --repo .` passed with no failure; its six warnings are pre-existing, none on this record.

### Outstanding concerns

- `verifyGranolaCheckpoint` still checks every ledger entry's document on each import, so a marked meeting whose staged capture has been removed from the receiver, while its entry is still staged or awaiting review, still stops the import. That is whole-ledger integrity rather than the skip, and was left out of scope.
- `ki acquire mark` still requires a committed receipt before it adds membership, so the folder's trust rests on that step and on no one adding notes to the folder by hand.

### Post-change review

The skip is now a pure selection filter applied before any content read, so it needs no ledger, Git or file access, and every other path through the import is unchanged.

### Mini recap

Routine Granola import trusts Acquired membership alone: marked meetings are skipped silently, the ledger only carries forward what it already held, and marking stays the proof-gated step.

## Discussion

Keeping the ledger untouched for skipped meetings, rather than writing a marker-only entry, means the ledger still records only verified captures and Acquire's existing `.acquire/granola/ledger.json` needs no migration.
