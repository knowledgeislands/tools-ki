---
id: KI-TOOL-CLI-028
title: Make trade payloads survive receiver formatting
theme: cli
horizon: now
status: done
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Let a decided trade be released, by making the payload this repository emits stable under the Markdown formatting any receiver will apply to it, so that the payload-immutability guard rejects genuine tampering rather than a formatter's whitespace.

## Context

Three trades reached a terminal receiver decision and became release-eligible: `TRD-961f5d5a` retained, `TRD-d7d00505` applied, `TRD-dbcda0ce` applied. `ki trade release --eligible --yes` aborted the batch on the first of them with `receiver inbound trade TRD-961f5d5a does not preserve the sender payload`, and nothing was released.

The guard is right that the bytes differ and wrong about what that means. Comparing the two payload bodies shows a single difference: the receiver's copy carries one blank line after the closing frontmatter delimiter where the sender's copy carries none. Nothing else in any body differs. The same divergence is present in four of the five records — `TRD-961f5d5a`, `TRD-d7d00505`, `TRD-dbcda0ce` and `TRD-094f7987`. The fifth, `TRD-aacc8a12`, matches exactly, and it matches because its sender copy was authored by hand and already carried the blank line.

That is the whole mechanism. Prettier, and every Markdown formatter in common use, puts a blank line between frontmatter and the first block. A receiver that formats its repository will therefore normalise every payload this CLI writes, on its first formatting pass, without anyone editing the record. The sender emits Markdown that is not canonical under the formatter it will meet, so the guard fires on contact with an ordinary repository hygiene pass rather than on tampering.

The consequence is that no trade can currently complete its lifecycle. Release is the step that clears a decided submission, and it is unreachable for every record the CLI generated.

## Boundary

This item does not weaken the payload-immutability guard into a fuzzy comparison. A receiver altering a trade's substance must still be caught, and that is the guard's reason to exist. It does not rewrite already-frozen sender submissions in place, which the trade contract forbids. It does not change the receiver's obligations, which are the Harness's to hold, and it does not treat the Harness's formatting pass as a fault on its side.

## Current state

Both fixes are in place, and investigating the first uncovered a second divergence of the same class.

Trade writers now emit a blank line between the frontmatter and the payload heading. That form is a fixed point of Prettier; the previous form was not, and running Prettier over an untouched record inserted exactly the missing line and nothing else.

That alone was not enough. Attempting the release against the real records surfaced the second cause: the receiver's copy carried `title: 'value'` and `source_ref: 'value'` where the sender emitted double quotes, because a Markdown formatter formats the frontmatter's YAML as well as the prose. No single emitted quoting style can satisfy every receiver, since the choice follows each repository's own formatter configuration rather than anything this repository controls.

So the comparison moved rather than the emission alone. `sameSenderPayload` now compares a projection of what the sender authored — the eight sender-owned field values as parsed, and the body trimmed of surrounding whitespace — instead of the raw bytes with lifecycle fields filtered out. Frontmatter quoting and whitespace at the payload's edges are the formatter's; field values and prose are the sender's, and a change to either still fails the guard with the same message.

## Steps

- [x] Decide between the two available fixes, or take both. Both were taken: the writer emits the canonical blank line, and the comparison no longer depends on raw bytes.
- [x] Check the emitted payload against the formatter the house Markdown convention specifies, rather than against what happens to round-trip today, so a second formatting rule does not reopen this in a different place. Doing so is what found the YAML quoting divergence, which the blank-line fix alone would have left in place.
- [x] Resolve the four in-flight records. The semantic comparison releases them as they stand; none was rewritten, which the contract forbids.
- [x] Cover the case through the CLI seam: a receiver copy carrying every formatter change at once releases, and a receiver copy whose prose differs still fails.
- [x] Re-run `ki trade release --eligible` and confirm the three decided trades clear.

## Files touched

- `src/core/trade-core.ts` — payload emission and the pairing comparison.
- `src/tests/cli/trade/trade.test.ts` — the release and pairing cases.
- `-/_TRADES/knowledgeislands/ki-agentic-harness/` — three released records removed by the verified release, none rewritten.

## Verify

`ki trade release --eligible --yes` cleared `TRD-961f5d5a`, `TRD-d7d00505` and `TRD-dbcda0ce` without a payload error, taking the estate from ten trades to seven. The pre-existing test for a receiver copy with genuinely different prose still fails the same guard with the same message. The full CLI contract suite passes at 100% coverage on all four metrics.

The new CLI test was confirmed to have teeth by reverting the comparison change and observing it fail, then restoring it.

## Dependencies / blocks

Nothing local blocks this item. It blocks the release leg of every trade this repository has sent, including the originating trades for `KI-TOOL-CLI-022` and `KI-TOOL-CLI-027`, neither of whose substance it affects.

## Discussion

### Why the sender is the right place to fix this

Both sides could change, but only one of them can change once. Asking every receiver to exempt trade records from formatting is a standing obligation on every current and future peer, enforced by nothing, and it fails silently the first time someone runs a formatter across a repository. Emitting Markdown that is already a fixed point of the formatter costs one character and holds without anyone remembering it.

### Why the comparison had to move as well

Emitting the canonical form fixes records sent afterwards. It does nothing for records already frozen, and the contract forbids rewriting a frozen submission to match. The YAML quoting divergence then showed the deeper reason: the receiver's formatter configuration is not this repository's to predict, so there is no emitted form that is a fixed point of every receiver. A comparison anchored to bytes will keep failing on whichever formatting rule has not been discovered yet.

Comparing the parsed payload ends that class of failure rather than the current instance of it. It also states the contract more honestly than the byte comparison did: a trade is its field values and its prose, and a receiver is free to store that however its repository stores Markdown.

### What this deliberately does not cover

A receiver whose formatter rewraps prose — `proseWrap: "always"` where the house convention is `never` — would change the body's bytes and fail the guard. That is not whitespace at the payload's edges, and tolerating it would need Markdown to be compared semantically rather than as text. No such receiver exists in the estate, and the failure would be loud rather than silent, so it is recorded here rather than solved.
