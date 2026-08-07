---
id: KI-TOOL-CLI-026
title: Implement trade phase field
theme: cli
horizon: now
status: draft
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Let every copy of a trade record state its own lifecycle position in the record itself, through an explicit `phase` field drawn from a closed vocabulary, so that a record's state is readable from the record rather than inferred from which directory it sits in or from a field's absence.

## Context

A trade record's lifecycle is currently encoded twice, in its path and in its frontmatter, and the two carry different amounts of it. A local preparation lives beneath `-/_TRADES/_PREPARATIONS/<owner>/<name>/` and declares `phase: preparing`, which the reader validates. The submitted sender copy lives beneath `-/_TRADES/<owner>/<name>/` and declares no phase at all, because submission removes the field. Submitted state is therefore expressed by the absence of a marker rather than by a value, so a record that lost its phase line for any other reason is indistinguishable from a submitted one.

The reserved directory name also shares a namespace with repository owners, so the outbound scan must skip an entry literally named `_PREPARATIONS` while walking owner directories. That skip is a workaround for a name collision that only exists because the lifecycle lives in the path.

`TRD-961f5d5a` records this to the Harness, which owns the record contract and the phase vocabulary. This item is the host half: `ki` writes, reads, validates, moves, and reports on every trade record, so the change lands almost entirely in `src/core/trade-core.ts`.

## Boundary

This item does not decide the vocabulary or the contract; the Harness does. It does not change `decision_status`, which stays a separate field on its own axis recording the receiver's disposition toward the trade rather than the state of the copy carrying it — the two advance independently. It does not change per-partner `<owner>/<name>` grouping, which stays. It does not touch what the `-` and `+` working areas mean, which continue to encode direction.

**No compatibility path.** Records without a valid `phase` are not accepted after the cutover; existing records are migrated in the same change.

## Current state

`TradeRecord.phase` in `src/core/trade-core.ts` is typed `'preparing'` and is populated only when `direction === 'preparation'`. `recordFromContents` allows `phase` in the permitted field set only for the preparation direction, rejects a preparation whose phase is not exactly `preparing`, and omits the field entirely for the outbound and inbound directions.

`tradePath` composes the `_PREPARATIONS` segment for the preparation direction, `senderContents` hard-codes the literal line `'phase: preparing'`, and `peerDirectories` roots the preparation scan at `-/_TRADES/_PREPARATIONS` while skipping an owner directory literally named `_PREPARATIONS` during the outbound scan. `routeDependencies` likewise probes both the preparation and the submitted root when checking whether a route can be withdrawn.

The defect this item must remove is in `submitTrade`:

```ts
const contents = trade.record.contents.replace('\nphase: preparing\n---\n', '\n---\n')
```

This strips the field by replacing the exact text of the phase line followed by the closing frontmatter delimiter, so it silently depends on `phase` remaining the last key in the block. Reordering the frontmatter would leave the replacement unmatched, the submitted record would still declare itself preparing, and nothing would catch it — the field is not validated on the outbound path, so the mismatch is invisible. Replacing a move plus a text strip with an ordinary field update removes the ordering dependency entirely.

`TradeLifecycle.publicationStatus` already carries `'preparing' | 'submitted'`, computed rather than read, so the reporting vocabulary is largely in place.

One further coupling needs care: `sameSenderPayload` compares `rawSenderProjection` of an outbound record against that of an inbound one, and the inbound projection strips only `receiverFieldNames`. If the same logical record carries `phase: submitted` on the sender side and `phase: received` on the receiver side, the projections will differ and the comparison will report a mismatched payload unless `phase` is normalised out of that projection.

## Steps

- [ ] Confirm the settled vocabulary from the Harness before writing code; this item assumes `preparing`, `submitted`, and `received`.
- [ ] Widen `TradeRecord.phase` to the closed vocabulary, make it required on every direction, and validate the permitted value per direction in `recordFromContents`.
- [ ] Emit `phase` in `senderContents` for a new preparation as an ordinary field, no longer relying on its position in the block.
- [ ] Replace the `submitTrade` text strip with a field update writing `phase: submitted`, and rewrite the record in place rather than moving it between directories.
- [ ] Set `phase: received` on the receiver copy alongside the `decision_status` and `received_from_ref` that receipt already adds.
- [ ] Retire `_PREPARATIONS`: remove the segment from `tradePath`, root the preparation scan at the per-partner directories, and delete the outbound scan's `_PREPARATIONS` skip and the two-root probe in `routeDependencies`. Locate a preparation by its phase field instead.
- [ ] Normalise `phase` out of `rawSenderProjection` so that a submitted sender copy and its received counterpart still compare equal.
- [ ] Derive `TradeLifecycle.publicationStatus` from the field rather than from the path.
- [ ] Migrate the ten existing records across the registered estate, none of which is currently a preparation, so every one gains an explicit phase.
- [ ] Cover each phase transition, each per-direction rejection, and the reordered-frontmatter case through the CLI seam.
- [ ] Update `man/ki.1`, `README.md`, and `CHANGELOG.md`.

## Files touched

- `src/core/trade-core.ts` — record type, parsing, validation, path composition, submission, receipt, scanning, and lifecycle derivation.
- `src/commands/trade/records.ts` and `src/commands/trade/shared.ts` — reporting where publication status is surfaced.
- `src/tests/cli/trade/` — phase transition, rejection, and migration tests.
- The estate's existing `-/_TRADES/` and `+/_TRADES/` records, migrated.
- `man/ki.1`, `README.md`, `CHANGELOG.md`.

## Verify

`bun run test` and `bunx tsc --noEmit`. Coverage remains at 100% over product code with no threshold change, so each per-direction rejection needs a reachable CLI test.

A test must specifically prove the removed defect cannot return: author a preparation, reorder its frontmatter so `phase` is not the last key, submit it, and assert the submitted record declares `phase: submitted`. Under today's implementation that record would still declare itself preparing.

Confirm `ki trade list` and `ki trade show` report the same publication status before and after the change for every existing record, and that a submitted record's path is now identical to its preparation path.

Confirm a record with no phase, or with a phase outside the vocabulary, or with a phase invalid for its direction, is rejected with a specific diagnostic.

## Dependencies / blocks

None locally. This item is independent of `KI-TOOL-CLI-025`: they touch different parts of `src/core/trade-core.ts` and no ordering between them is required, though sequencing them will avoid an incidental merge conflict in that file.

`KI-HARNESS-GOV-022` in `knowledgeislands/ki-agentic-harness` settles the record contract and phase vocabulary this item implements, and `KI-HARNESS-GOV-021` is the related configuration-layout item in the same batch. Both are recorded as prose rather than as `blocked-by` identifiers, because they live in another repository which owns its own priority, plan, and execution.

`TRD-961f5d5a` is the originating trade, sent from this repository to the Harness.

## Discussion

### Why the field rather than the directory

A path can only say where a copy sits in one repository's layout, and it says nothing at all once the file is read on its own. A field travels with the record, is visible in any reader, and can name a state that the sender's directory tree has no place for — `received`, which exists only in the counterpart repository. Encoding the same fact twice guarantees the two will eventually disagree; the current implementation already shows how, since only one of the two encodings is validated.

### What the version-control history loses

Replacing a file move with a field rewrite changes how submission appears in version control, from a rename to a content change. That is a real trade: a rename is a compact, legible signal in a log. Against it, a rename is only legible in the repository that performed it, whereas the field is legible everywhere, and the estate gains a stable path for a record across its whole life. The trade records this consequence explicitly so the Harness could weigh it; this item follows whatever it decides.

### Why `decision_status` stays separate

Phase describes the state of the copy; `decision_status` describes the receiver's disposition toward the trade. A received copy may be `in_progress`, `adopted`, or `declined` without its phase changing, and a submitted copy has no disposition at all. Collapsing them would force one axis to encode the other, which is the exact mistake the path encoding already makes.
