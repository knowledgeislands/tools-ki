---
id: KI-TOOL-CLI-031
title: Cover reachable trade guard
theme: cli
horizon: now
status: done
blocks: []
blocked-by: []
baseline-ref: 6c0e4f5f8d558ce500b9291a98e7cf840290f140
---

## Goal

Remove a `/* v8 ignore */` that suppresses a reachable guard in trade record parsing, and cover the guard with a CLI test, so the coverage gate measures the span it was written to exempt.

## Context

An audit of every `/* v8 ignore */` in product code found ninety-five sites, of which one carries a justification that does not hold. The block at `src/core/trade-core.ts:557` states that `phaseOf` has already rejected a phase outside the vocabulary and derived the record's direction from it, so a record whose declared phase disagrees with its direction cannot exist by the time `recordFromContents` validates it.

That is true of one caller. `locateTrades` derives direction from `phaseOf`, and `localTrade` inherits that derivation, so for those paths the check is genuinely tautological. The other callers of `recordFromContents` pass a direction as a literal, having decided it from the path they read rather than from the record's contents.

`releaseTrade` is the case that matters, at `src/core/trade-core.ts:1120`. It reads the receiver's file — in a different repository, hand-editable, and rewritten by that repository's formatter — and asserts `'inbound'`. Nothing upstream has consulted that file's `phase:` field. A receiver record that says `submitted`, because it was copied into place rather than recorded through `ki trade receive`, reaches the guard and throws. No concurrency is required and no internal invariant is violated; it is an ordinary CLI path over a file another repository owns.

The guard is therefore correct and its exemption is not. The gate currently reports 100% while two lines of a cross-repository trust boundary go unmeasured.

## Boundary

This item removes one ignore block and covers the guard beneath it. It does not change the guard's behaviour, the phase vocabulary, the direction derivation, or any other ignore site. The wider sweep of the remaining justifications is a separate concern, recorded below rather than performed here.

## Current state

`src/core/trade-core.ts:557-563` wraps the phase-vocabulary check and the phase-direction agreement check. Coverage passes at 100% on all four metrics with the block in place, which confirms no existing test reaches either line.

Seven call sites reach `recordFromContents`: one through `locateTrades` at line 980, and six passing a literal direction, at lines 712, 721, 787, 862, and 1120. The `AGENTS.md` convention added alongside this record requires an ignore justification to hold for every caller of the function it sits in, so this site now violates a stated convention rather than merely an implicit one.

## Steps

- [x] Remove the `/* v8 ignore start */` and `/* v8 ignore stop */` pair at `src/core/trade-core.ts:557-563`.
- [x] Add a CLI test driving `ki trade release` against a receiver whose inbound record declares a phase inconsistent with its location, asserting the diagnostic and the exit code.
- [x] Confirm both lines are covered rather than only the first, since the vocabulary check and the agreement check fail on different inputs and one test reaches only one of them.
- [x] Correct the comment on any part of the block that survives, so no justification is left claiming a guarantee that only one caller provides.

## Files touched

- `src/core/trade-core.ts` — the ignore block and its justification.
- `src/tests/cli/trade/` — the release-path coverage.

## Verify

`bun run test` passes with 100% coverage on all four metrics and two fewer exempted lines. The new test fails if the guard is deleted, which is what distinguishes covering the guard from deleting it as dead code.

## Dependencies / blocks

Nothing blocks this item and it blocks nothing. It touches `src/core/trade-core.ts`, which `KI-TOOL-CLI-025` will also edit if the Harness settles a new configuration contract, but the two do not overlap: this is record parsing and that is route table parsing.

## Review

Delivered in `a99482f`. Both lines are covered by one test driving `ki trade release` twice against the same received trade — a phase outside the vocabulary, and a valid phase belonging to another location — because the two checks fail on different inputs. Neutering either line alone fails its own assertion, so the test pins the guard rather than merely reaching it; without the guard both records fall through and are treated as well-formed. Exit code is 2 rather than 1, trade errors mapping to 2 throughout this CLI. Coverage rose from 4848 to 4852 measured statements at 100% on all four metrics.

Implementation sharpened the record's account of why the guard is reachable. The Context above attributes it to the receiver's file being hand-editable, which is true but not sufficient. `localTrade` scans with a repository filter pinned to the local repository, so the estate scan never traverses the receiver at all. Had it done so, `phaseOf` would have thrown first with identical wording and a test would have passed while covering nothing. Both facts are needed: the scan does not reach the file, and the file is not trustworthy.

## Done

Accepted by the repository owner on 2026-08-08. The ignore pragma is gone, both lines of the guard are measured, and the convention that caught this is recorded in `AGENTS.md` so the next justification written from a single call site fails review rather than the gate.

## Discussion

### Why this is worth a record rather than a drive-by fix

The guard is on the path that decides whether a trade may be released, which is the same boundary whose payload comparison had to be rewritten in `KI-TOOL-CLI-028`. A test there is worth having on its own merits, independently of the coverage arithmetic.

### The remaining justifications

Of the ninety-five sites, roughly twenty-five justify themselves by an upstream guarantee, and this audit traced the callers for two of them. The rest were classified by reading the justification rather than by checking every caller, so the same error could be present elsewhere. Sweeping them is not proposed here, because the convention now recorded in `AGENTS.md` catches the case at the point where an ignore is written or a caller is added, which is cheaper than an audit that goes stale the moment it finishes.
