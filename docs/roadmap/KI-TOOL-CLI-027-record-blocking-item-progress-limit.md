---
id: KI-TOOL-CLI-027
title: Resolve blocking-item progress limit
theme: cli
horizon: now
status: awaiting-review
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Record, and eventually resolve, the constraint that the live progress display can only advance while a rubric item yields the event loop, so that a future reader does not rediscover the limit by measurement or mistake the refresh timer for a defect in this repository.

## Context

`ki repo audit` and `ki repo conform` report item progress at both edges of each item and refresh the display on a timer between those edges, so the elapsed clock and the indeterminate sweep advance during a long item. The refresh is inert whenever the running item blocks the event loop, because a timer callback cannot be delivered while the loop is blocked.

Measured against a real `ki repo audit --skill ki-engineering` in this repository, the refresh timer registered once and fired zero times across 26.5 seconds of wall clock, where roughly one hundred and six firings were due. The corresponding frame capture showed eighty-eight frames carrying only three distinct clock values, jumping directly from `0.0s` to `30.5s`. Every frame emitted was an item-edge event; not one was a refresh.

The cause is outside this repository. Rubric items execute their subprocesses synchronously, so the host's `await` on an item never yields between the item starting and finishing. This repository already recorded the same mechanism from a different direction: a work item captured and then reverted for the concurrent-coverage race noted that the `ki-engineering` audit evidence context runs its checks synchronously, which is why one skill evaluation cannot overlap itself.

## Boundary

This item does not change the rubric contract, which is portable and owned elsewhere, and does not move item execution into a worker thread or child process to reclaim the event loop — that would be a large architectural change to the native operation host and is very likely the wrong answer to a presentation problem. It does not remove the refresh timer, which is correct and becomes effective as soon as an item yields.

## Current state

The refresh capability is injected as `startInterval` on the context, mirroring `onInterrupt`, and is started only for an interactive display because a plain stream would otherwise gain a line per refresh. Its behaviour is covered through the CLI seam by firing the captured handler.

An outbound work trade to the Harness proposed that rubric items avoid blocking the event loop, carrying the measurement above as evidence. The Harness applied it. `TRD-d7d00505` carries `decision_status: applied` against harness commit `b0cdf90a33d55ad67f077780c410e6ba2381c88d`, with the rationale that evidence gathering now awaits each external command and the session is asynchronous, so a run yields between subprocesses.

Re-measuring against that change resolves the constraint. `ki repo audit --skill ki-engineering` in this repository, captured on a pseudo-terminal, now produces eighty-eight distinct elapsed-clock values advancing from `0.0s` to `21.8s` in steps of `0.3s` — the configured 250-millisecond refresh, rounded to the displayed tenth. The same capture before the change held eighty-eight frames carrying three distinct clock values and jumped from `0.0s` straight to `30.5s`. The refresh fires, the clock advances during a long item, and a frozen display no longer misreports a running operation as a hang.

This measurement was taken with `ki dev local` enabled, so the harness under test was the working checkout at `101e39c0`. The CLI's canonical archive pin `501b40111aefa774aff49f10893dc235708a823c` predates the fix by 253 commits, so a user on the pinned archive still sees the old behaviour. Moving that pin is the same external prerequisite `KI-TOOL-CLI-018` records, and it gates when this resolution reaches users rather than whether it is correct.

## Steps

- [x] Track the Harness's disposition of the outbound trade, and reconcile this item with whatever it decides rather than presuming adoption. Applied, not declined.
- [x] If items begin to yield, confirm by measurement that the refresh fires at the expected rate and that the clock advances during a long item.
- [x] If the Harness declines or defers, decide whether the host should say something explicit when an item has been running without yielding. Not reached: the Harness applied the change, so no attribution fallback is needed.
- [x] Keep the measurement reproducible, so the constraint can be re-checked cheaply after any change to either side. See Verify.

## Files touched

- `src/core/repository-reporting.ts` — the refresh and any attribution of a non-yielding item.
- `src/context.ts` — the injected interval capability, if its shape needs to change.
- `src/tests/cli/repo/` — coverage for whatever behaviour is added.

## Verify

Capture an audit on a pseudo-terminal and count the distinct elapsed-clock values it emits against wall-clock time:

```
script -q /dev/null ki repo audit --skill ki-engineering > frames.txt 2>&1
```

Then count distinct `N.Ns` values in `frames.txt`. The constraint is resolved when their spacing approaches the configured refresh interval rather than the item-edge spacing. It currently yields eighty-eight values spaced `0.3s` apart across a 21.8-second run.

Confirm that no change made here reintroduces a refresh on a plain stream, which would put one line per interval into a log.

## Dependencies / blocks

Nothing local blocks this item. Its substance depended on the Harness's decision about the outbound trade, which could not be expressed in `blocked-by` because that field admits only local work-item identifiers. That disposition is now known and applied, so the record moves to review.

`TRD-d7d00505` is the originating trade. It is release-eligible but cannot yet be released: the receiver's copy differs from the sender payload by one blank line after the frontmatter, which the payload-immutability guard correctly rejects. That defect is recorded separately and does not affect this item's substance.

## Discussion

### Why not reclaim the event loop locally

Running each item in a worker thread or child process would let the host refresh regardless of what an item does, but it would change the execution model of every rubric to solve a display problem, and it would introduce serialisation and failure semantics at a boundary that currently has none. The cost is out of proportion to the benefit.

### Why keep the refresh timer

It is correct, it is covered, and it costs nothing when it cannot fire. It already helps any item that performs asynchronous work, and it is the part that must exist before a yielding item can be shown advancing. Removing it would only have to be undone.
