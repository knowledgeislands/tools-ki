---
id: KI-TOOL-CLI-022
title: Report evidence gathering as progress
theme: cli
horizon: now
status: draft
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Make the repository-operation progress display account for the time an operation actually spends, by reporting the evidence-gathering phase that currently runs entirely unreported between planning and the first item.

## Context

This item was originally specified to weight the progress bar by learned per-item duration, on the assumption that rubric items differ enormously in cost and that a uniformly weighted bar therefore leaps and then parks. The assumption was wrong, and measuring it is what showed that.

An instrumented `ki repo audit --skill ki-engineering` against this repository divides as follows: loading the rubric definition takes 0.02 seconds, the session's evidence gathering takes 22.13 seconds, and the sum of all forty-two item durations is 0.00 seconds. A persisted weight table was implemented and run against this rubric; every item recorded either zero or one millisecond. Weighting items by observed duration would therefore weight a set of zeros, and the bar would still sit at nothing for twenty-two seconds before racing to complete. That implementation was reverted rather than shipped, because a learned cache that learns zeros adds an on-disk artifact and a maintenance burden for no observable change.

The time is not mysterious once located. The `ki-engineering` evidence collector runs six commands synchronously through one `execSync` helper before any item is evaluated: `bunx @biomejs/biome check`, `tsc --noEmit`, `bunx syncpack format --check`, `bunx knip --no-config-hints`, `bun outdated`, and `bun run test:coverage`. Process sampling across a run showed `bun run test:coverage` alive for thirty-three of forty-four samples, so the repository's own test suite accounts for the large majority of the twenty-two seconds. None of that is waste; it is the criterion doing exactly what it is specified to do. It is simply invisible.

The real shape of the problem is that the expensive work happens in one unreported block. A skill's session gathers its evidence up front, running the subprocesses that cost the time, and the items that follow merely inspect what it produced. Between the host announcing its plan and the first item reporting, nothing is emitted at all, so the display shows zero of forty-two items for the entire period during which the operation is doing all of its work.

## Boundary

This item does not reintroduce per-item duration weighting, which the measurement above rules out for the reference rubric. It does not change the rubric contract, which is portable and owned by the Harness, and it does not move execution off the main thread. Whether a session can report its own internal progress is the Harness's to decide; this item covers what the host can represent with the information it has, and what it would represent if the Harness offered more.

## Current state

The host reports `loading N/M definitions` while preparing skills, then announces its plan, then reports at each item edge. Session creation happens inside the first call into a prepared skill, after the plan is announced and before any item edge, and is invisible to the host except as elapsed time.

The display also cannot refresh during that block, because the evidence gathering runs its subprocesses synchronously and holds the event loop. That constraint is recorded separately in `KI-TOOL-CLI-027`, and an outbound trade proposes that items yield; this item is about representing the phase, not about animating it.

## Steps

- [ ] Report the transition into evidence gathering as its own phase, so the display names what is happening instead of showing a stalled item count.
- [ ] Confirm by measurement how much of a representative operation falls inside that phase, for this repository and for at least one other, so the reporting is proportionate to reality rather than to this one rubric.
- [ ] Decide what the bar should show while a single unreported block dominates the operation, given that a proportion cannot be computed without knowing what the phase contains.
- [ ] Establish whether the Harness could report progress within evidence gathering, and if it could, what minimal contract would carry it; capture the outcome rather than assuming it.
- [ ] Keep the plain-stream form informative, since a phase transition is exactly the kind of event a log should carry.

## Files touched

- `src/core/repository-reporting.ts` — phase reporting and what the bar shows during an unmeasured block.
- `src/core/runtime.ts` — only if the host needs a signal at the session boundary it does not currently have.
- `src/tests/cli/repo/` — coverage for the new phase through the CLI seam.

## Verify

Run an audit against a skill whose evidence gathering dominates, and confirm the display names that phase for its duration rather than showing an unchanging item count. Confirm the reported phase boundary matches the measured one, and that a fast rubric does not gain a spurious phase it spends no time in.

Re-run the phase measurement afterwards and confirm the reported structure matches where time is genuinely spent.

## Dependencies / blocks

Nothing local blocks this item. It overlaps `KI-TOOL-CLI-027`, which records that the display cannot refresh while an item or a session holds the event loop: naming the phase helps even while frozen, since a named phase that does not tick is still more informative than an item count that does not move.

## Discussion

### Why the original premise failed

The rubric contract offers no way to declare what an item costs, and the natural inference was that cost must therefore be learned by observation. The inference was sound but the target was wrong: the cost is not distributed across items at all, it is concentrated in a phase the host never reports. Measuring before building is what surfaced that, and the measurement is recorded here so the same inference is not made again.

### Why not weight by session cost instead

Learning how long a skill's session takes and weighting whole skills by it would be the direct analogue of the reverted design, and it may be worth doing. It is deliberately not proposed yet, because a single-skill operation would gain nothing from it, and the multi-skill case should be measured before it is designed.
