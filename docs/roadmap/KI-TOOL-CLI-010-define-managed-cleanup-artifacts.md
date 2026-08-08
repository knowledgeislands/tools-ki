---
id: KI-TOOL-CLI-010
title: Define managed cleanup artifacts
theme: cli
horizon: now
status: draft
blocks: []
blocked-by: [KI-TOOL-CLI-035]
baseline-ref: null
---

## Goal

Define a safe, recoverable ownership record for KI-managed artifacts so future cleanup can identify only state KI created.

## Context

Define a persisted, versioned KI-owned stale-artifact format so a future `ki cleanup` can safely identify, report, and remove only state it owns. The design must establish creation ownership, staleness evidence, concurrency protection, recovery behaviour, and deterministic reporting before any deletion behaviour is introduced.

## Boundary

This item does not change V1's non-mutating cleanup report, infer ownership from cache or transaction-looking paths, delete unconfigured harnesses or links, or introduce broad filesystem cleanup.

## Current state

Five persisted artifact families exist, none carrying an ownership record:

| Family | Producer | Location |
| --- | --- | --- |
| `.install-` staging | `installHarness` | harness owner directory † |
| `.replace-` parked payload | `installHarness` | harness owner directory † |
| Trade observation cursors | `trade-core.ts:871` | `paths.state/trades/observations/` |
| Estate route diagram | `trade/routes.ts:189` | `paths.cache/estate-routes.html` |
| Installer receipt | `manage/update.ts:12` | `paths.state` |

† Recovered concretely by `KI-TOOL-CLI-035`, which this item is sequenced behind.

`ki manage cleanup` reports `ELIGIBLE=0` unconditionally: it is the V1 no-op, and it stays that way until this design authorises otherwise.

## Steps

- [ ] Survey the five families above, recording for each its producer, exact owned paths, lifetime, and who owns recovery.
- [ ] Establish what a `.install-`/`.replace-` recovery, once implemented by `KI-TOOL-CLI-035`, actually needed to know — and treat that as the minimum the record must express.
- [ ] Define the manifest: version, producing operation, owned paths, lifecycle state, and where it lives relative to its artifact.
- [ ] Settle whether the manifest is written atomically with its artifact, and what a reader does with an unknown version.
- [ ] Define staleness evidence and its refusal conditions, including live, interrupted-recoverable, manually altered, and foreign.
- [ ] Specify the deterministic dry-run report, naming each refusal reason.
- [ ] Propose the first concrete family to carry a manifest, as a separate implementation record.

## Files touched

Design-only. Any implementation lands in a successor record; this item is expected to touch `docs/` alone.

## Verify

The design names every family in the table, and for each states producer, owned paths, lifetime, and recovery owner. A reviewer can answer, for each refusal condition, what the report says and why deletion is withheld. No delete verb is proposed, and `ki manage cleanup` still reports `ELIGIBLE=0` when this item closes.

## Dependencies / blocks

Blocked by `KI-TOOL-CLI-035`, which recovers the first family concretely. Nothing else blocks it, and it blocks nothing.

## Discussion

### Ownership record

Any candidate artifact format must identify its creating KI operation, version, exact owned paths, and lifecycle state. Cleanup may rely only on that persisted record, never on a filename pattern, cache location, or resemblance to a transaction directory.

The first design must also establish where the record lives, whether it is written atomically with its artifact, and how a later KI release establishes backwards-compatible reader behaviour without treating an unknown record as deletable state.

### Staleness and recovery evidence

The design must define positive staleness evidence, concurrent-operation exclusion, interruption recovery, and deterministic dry-run reporting before it can authorise a deletion. A missing or malformed ownership record is a refusal condition, not an invitation to infer intent.

Evidence should distinguish a completed artifact eligible for cleanup from an operation that is still live, interrupted but recoverable, manually altered, or outside KI ownership. A cleanup report needs to name each refusal reason so an operator can make a deliberate recovery decision rather than retrying blind.

### Candidate first deliverable

The first executable outcome is a versioned manifest and a read-only `ki cleanup` report over one concrete KI-created artifact family. It must prove containment before any delete verb is proposed, and its test fixture must cover interrupted writes, lock contention, foreign files, symlinks, malformed manifests, and a repeatable dry run.

### Promotion condition — met

Promote this item when a KI operation first needs to persist a versioned, recoverable managed artifact and can name its producer, owned paths, lifetime, and recovery owner. Until then, V1's explicit no-op cleanup result remains the correct safety boundary.

That condition is now met, which is why this item moved from `future` to `now`. `installHarness` persists two artifact families whose producer, owned paths and lifetime are all nameable — the `.install-` staging directory at `src/core/registry.ts:241` and the `.replace-` parked payload at `:249` — and an interrupted process leaves either behind. `KI-TOOL-CLI-035` records the live failure that follows: an orphan makes `discoverInstalledHarnesses` refuse the whole owner directory, while `ki manage cleanup` reports `ELIGIBLE=0` over exactly the state it exists to report.

Three other persisted families exist and belong in the survey this item owes: the trade observation cursors under `paths.state/trades/observations/`, the generated `estate-routes.html` under `paths.cache`, and the installer receipt read by `ki manage update`. None is currently covered by an ownership record.

### Relationship to `KI-TOOL-CLI-035`

`035` fixes the staging-directory failure directly and is deliberately not blocked on this design. This item is `blocked-by: [KI-TOOL-CLI-035]` so its general record is drawn from a family that has already been recovered concretely, rather than from a hypothesis about one. The specific fix teaches the general design what it needs to express; doing them in the other order risks a manifest format that fits no real artifact.
