---
id: KI-TOOL-CLI-028
title: Make trade payloads survive receiver formatting
theme: cli
horizon: now
status: draft
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

Trade writers emit the frontmatter delimiter followed immediately by the payload heading. Pairing compares sender and receiver payloads for byte equality after stripping `phase`, which is legitimately divergent because sender and receiver hold different lifecycle states.

Four records are already in flight with the non-canonical form, so whatever is decided has to account for records that were emitted before the decision as well as records emitted after it.

## Steps

- [ ] Decide between the two available fixes, or take both: emit a canonical blank line after the frontmatter so the payload is a fixed point of the formatter, and/or normalise that specific boundary before comparison so an already-emitted record can still be released.
- [ ] Check the emitted payload against the formatter the house Markdown convention specifies, rather than against what happens to round-trip today, so a second formatting rule does not reopen this in a different place.
- [ ] Resolve the four in-flight records, since changing the writer alone does not make an already-sent record releasable.
- [ ] Cover the case through the CLI seam: a receiver copy that differs only by frontmatter-boundary whitespace releases, and a receiver copy whose prose differs still fails.
- [ ] Re-run `ki trade release --eligible` and confirm the three decided trades clear.

## Files touched

- `src/core/trade-core.ts` — payload emission and the pairing comparison.
- `src/tests/cli/trade/trade.test.ts` — the release and pairing cases.
- `-/_TRADES/knowledgeislands/ki-agentic-harness/` — the four in-flight records, if they are migrated.

## Verify

`ki trade release --eligible --yes` clears `TRD-961f5d5a`, `TRD-d7d00505` and `TRD-dbcda0ce` without a payload error. A record whose receiver copy has genuinely different prose still fails the same guard with the same message. The full CLI contract suite passes at 100% coverage on all four metrics.

## Dependencies / blocks

Nothing local blocks this item. It blocks the release leg of every trade this repository has sent, including the originating trades for `KI-TOOL-CLI-022` and `KI-TOOL-CLI-027`, neither of whose substance it affects.

## Discussion

### Why the sender is the right place to fix this

Both sides could change, but only one of them can change once. Asking every receiver to exempt trade records from formatting is a standing obligation on every current and future peer, enforced by nothing, and it fails silently the first time someone runs a formatter across a repository. Emitting Markdown that is already a fixed point of the formatter costs one character and holds without anyone remembering it.

### Why the comparison may also need to move

Emitting the canonical form fixes records sent afterwards. It does nothing for the four already frozen, and the contract forbids rewriting a frozen submission to match. If those four are to be released rather than abandoned, the comparison has to tolerate that one boundary — which is defensible on its own terms, since the payload's meaning is its Markdown and not its whitespace.
